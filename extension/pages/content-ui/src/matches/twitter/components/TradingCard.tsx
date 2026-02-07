import { useState, useEffect } from 'react';
import {
    fetchEventBySlug,
    parseMarket,
    formatPriceAsPercent,
    formatVolume,
    formatEndDate,
    type ParsedMarket,
    type PolymarketEvent,
} from '@extension/shared';
import { InlineTradingPanel } from './InlineTradingPanel';

interface TradingCardProps {
    slug: string;
    type: 'event' | 'market' | 'unknown';
    fullUrl: string;
}

interface SingleMarketData {
    kind: 'single';
    title: string;
    question: string;
    market: ParsedMarket;
    eventImage?: string;
}

interface MultiMarketData {
    kind: 'multi';
    title: string;
    description?: string;
    eventImage?: string;
    markets: Array<{
        id: string;
        question: string;
        groupItemTitle?: string;
        yesPrice: number;
        noPrice: number;
        volume: number;
        endDate: string;
        closed: boolean;
    }>;
    totalVolume: number;
}

type MarketData = SingleMarketData | MultiMarketData;
type LoadingState = 'loading' | 'success' | 'error';

export function TradingCard({ slug, type, fullUrl }: TradingCardProps) {
    const [state, setState] = useState<LoadingState>('loading');
    const [data, setData] = useState<MarketData | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchData() {
            setState('loading');
            setError(null);

            try {
                const event = await fetchEventBySlug(slug);

                if (!event) {
                    setError('Event not found');
                    setState('error');
                    return;
                }

                if (!event.markets || event.markets.length === 0) {
                    setError('No markets found for this event');
                    setState('error');
                    return;
                }

                // Check if this is a multi-market event
                if (event.markets.length > 1) {
                    // Multi-market event
                    const markets = event.markets.map(m => {
                        const parsed = parseMarket(m);
                        return {
                            id: m.id,
                            question: m.question || '',
                            groupItemTitle: m.groupItemTitle,
                            yesPrice: parsed.outcomePrices[0] ?? 0.5,
                            noPrice: parsed.outcomePrices[1] ?? 0.5,
                            volume: parsed.volume,
                            endDate: m.endDate || '',
                            closed: m.closed || false,
                        };
                    });

                    // Sort by groupItemThreshold if available (for chronological ordering)
                    // then by closed status (active first)
                    markets.sort((a, b) => {
                        // Active markets first
                        if (a.closed !== b.closed) return a.closed ? 1 : -1;
                        return 0;
                    });

                    setData({
                        kind: 'multi',
                        title: event.title,
                        description: event.description,
                        eventImage: event.image,
                        markets,
                        totalVolume: parseFloat(event.volume?.toString() || '0'),
                    });
                    setState('success');
                } else {
                    // Single market event
                    const primaryMarket = event.markets[0];
                    const parsed = parseMarket(primaryMarket);

                    setData({
                        kind: 'single',
                        title: event.title,
                        question: primaryMarket.question || event.title,
                        market: parsed,
                        eventImage: event.image,
                    });
                    setState('success');
                }
            } catch (err) {
                console.error('[Insider] Error fetching market data:', err);
                setError('Failed to load market data');
                setState('error');
            }
        }

        fetchData();
    }, [slug, type]);

    if (state === 'loading') {
        return <LoadingCard />;
    }

    if (state === 'error' || !data) {
        return <ErrorCard message={error || 'Unknown error'} url={fullUrl} />;
    }

    // Render multi-market card
    if (data.kind === 'multi') {
        return <MultiMarketCard data={data} fullUrl={fullUrl} />;
    }

    // Render single market card
    return <SingleMarketCard data={data} fullUrl={fullUrl} />;
}

function SingleMarketCard({ data, fullUrl }: { data: SingleMarketData; fullUrl: string }) {
    const { market, title, eventImage } = data;
    const yesPrice = market.outcomePrices[0] ?? 0.5;
    const noPrice = market.outcomePrices[1] ?? 0.5;

    // Order panel state
    const [orderPanel, setOrderPanel] = useState<{
        isOpen: boolean;
        outcome: 'YES' | 'NO';
        price: number;
    }>({ isOpen: false, outcome: 'YES', price: 0.5 });

    const openOrderPanel = (outcome: 'YES' | 'NO', price: number) => {
        setOrderPanel({ isOpen: true, outcome, price });
    };

    const closeOrderPanel = () => {
        setOrderPanel({ ...orderPanel, isOpen: false });
    };

    return (
        <div
            style={{
                background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                borderRadius: '16px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                overflow: 'hidden',
                width: '100%',
                maxWidth: '500px',
            }}
        >
            {/* Header */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '16px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                }}
            >
                {eventImage && (
                    <img
                        src={eventImage}
                        alt=""
                        style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '8px',
                            objectFit: 'cover',
                        }}
                    />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                        style={{
                            fontSize: '14px',
                            fontWeight: 600,
                            color: '#e7e9ea',
                            lineHeight: 1.4,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                        }}
                    >
                        {title}
                    </div>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            marginTop: '4px',
                        }}
                    >
                        <span
                            style={{
                                fontSize: '11px',
                                color: '#71767b',
                            }}
                        >
                            {formatEndDate(market.endDate)}
                        </span>
                        <span style={{ color: '#71767b' }}>•</span>
                        <span
                            style={{
                                fontSize: '11px',
                                color: '#71767b',
                            }}
                        >
                            Vol: {formatVolume(market.volume)}
                        </span>
                    </div>
                </div>
                <PolymarketLogo />
            </div>

            {/* Price Display */}
            <div
                style={{
                    display: 'flex',
                    gap: '12px',
                    padding: '16px',
                }}
            >
                {/* YES Button */}
                <button
                    onClick={() => openOrderPanel('YES', yesPrice)}
                    style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '16px 12px',
                        background: 'rgba(34, 197, 94, 0.15)',
                        border: '1px solid rgba(34, 197, 94, 0.3)',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(34, 197, 94, 0.25)';
                        e.currentTarget.style.transform = 'scale(1.02)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(34, 197, 94, 0.15)';
                        e.currentTarget.style.transform = 'scale(1)';
                    }}
                >
                    <span
                        style={{
                            fontSize: '12px',
                            fontWeight: 500,
                            color: '#22c55e',
                            marginBottom: '4px',
                        }}
                    >
                        YES
                    </span>
                    <span
                        style={{
                            fontSize: '28px',
                            fontWeight: 700,
                            color: '#22c55e',
                        }}
                    >
                        {formatPriceAsPercent(yesPrice)}
                    </span>
                    <span
                        style={{
                            fontSize: '11px',
                            color: '#71767b',
                            marginTop: '4px',
                        }}
                    >
                        {Math.round(yesPrice * 100)}¢ per share
                    </span>
                </button>

                {/* NO Button */}
                <button
                    onClick={() => openOrderPanel('NO', noPrice)}
                    style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '16px 12px',
                        background: 'rgba(239, 68, 68, 0.15)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)';
                        e.currentTarget.style.transform = 'scale(1.02)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
                        e.currentTarget.style.transform = 'scale(1)';
                    }}
                >
                    <span
                        style={{
                            fontSize: '12px',
                            fontWeight: 500,
                            color: '#ef4444',
                            marginBottom: '4px',
                        }}
                    >
                        NO
                    </span>
                    <span
                        style={{
                            fontSize: '28px',
                            fontWeight: 700,
                            color: '#ef4444',
                        }}
                    >
                        {formatPriceAsPercent(noPrice)}
                    </span>
                    <span
                        style={{
                            fontSize: '11px',
                            color: '#71767b',
                            marginTop: '4px',
                        }}
                    >
                        {Math.round(noPrice * 100)}¢ per share
                    </span>
                </button>
            </div>

            {/* Footer - hide when trading panel is open */}
            {!orderPanel.isOpen && (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                        background: 'rgba(0, 0, 0, 0.2)',
                    }}
                >
                    <span
                        style={{
                            fontSize: '11px',
                            color: '#71767b',
                        }}
                    >
                        Powered by Polymarket
                    </span>
                    <a
                        href={fullUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            fontSize: '11px',
                            color: '#1d9bf0',
                            textDecoration: 'none',
                        }}
                    >
                        View on Polymarket →
                    </a>
                </div>
            )}

            {/* Inline Trading Panel */}
            <InlineTradingPanel
                isOpen={orderPanel.isOpen}
                onClose={closeOrderPanel}
                marketTitle={title}
                outcome={orderPanel.outcome}
                tokenId={orderPanel.outcome === 'YES' ? market.clobTokenIds[0] : market.clobTokenIds[1]}
                price={orderPanel.price}
            />
        </div>
    );
}

function MultiMarketCard({ data, fullUrl }: { data: MultiMarketData; fullUrl: string }) {
    const [showResolved, setShowResolved] = useState(false);
    const activeMarkets = data.markets.filter(m => !m.closed);
    const closedMarkets = data.markets.filter(m => m.closed);

    // Order panel state for multi-market
    const [orderPanel, setOrderPanel] = useState<{
        isOpen: boolean;
        outcome: 'YES' | 'NO';
        price: number;
        marketId: string;
        marketQuestion: string;
    }>({ isOpen: false, outcome: 'YES', price: 0.5, marketId: '', marketQuestion: '' });

    const openOrderPanel = (marketId: string, marketQuestion: string, outcome: 'YES' | 'NO', price: number) => {
        setOrderPanel({ isOpen: true, outcome, price, marketId, marketQuestion });
    };

    const closeOrderPanel = () => {
        setOrderPanel({ ...orderPanel, isOpen: false });
    };

    const handleYesClick = (marketId: string, marketQuestion: string, yesPrice: number) => {
        openOrderPanel(marketId, marketQuestion, 'YES', yesPrice);
    };

    const handleNoClick = (marketId: string, marketQuestion: string, noPrice: number) => {
        openOrderPanel(marketId, marketQuestion, 'NO', noPrice);
    };

    return (
        <div
            style={{
                background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                borderRadius: '16px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                overflow: 'hidden',
                width: '100%',
                maxWidth: '500px',
            }}
        >
            {/* Header */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '16px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                }}
            >
                {data.eventImage && (
                    <img
                        src={data.eventImage}
                        alt=""
                        style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '8px',
                            objectFit: 'cover',
                        }}
                    />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                        style={{
                            fontSize: '14px',
                            fontWeight: 600,
                            color: '#e7e9ea',
                            lineHeight: 1.4,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                        }}
                    >
                        {data.title}
                    </div>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            marginTop: '4px',
                        }}
                    >
                        <span
                            style={{
                                fontSize: '11px',
                                color: '#1d9bf0',
                                background: 'rgba(29, 155, 240, 0.15)',
                                padding: '2px 6px',
                                borderRadius: '4px',
                            }}
                        >
                            {activeMarkets.length} active
                        </span>
                        <span style={{ color: '#71767b' }}>•</span>
                        <span
                            style={{
                                fontSize: '11px',
                                color: '#71767b',
                            }}
                        >
                            Vol: {formatVolume(data.totalVolume)}
                        </span>
                    </div>
                </div>
                <PolymarketLogo />
            </div>

            {/* Active Markets List */}
            <div
                style={{
                    maxHeight: '320px',
                    overflowY: 'auto',
                    padding: '8px',
                }}
            >
                {activeMarkets.length > 0 ? (
                    activeMarkets.map(market => (
                        <div
                            key={market.id}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '10px 12px',
                                marginBottom: '4px',
                                background: 'rgba(255, 255, 255, 0.05)',
                                borderRadius: '10px',
                                border: '1px solid rgba(255, 255, 255, 0.05)',
                            }}
                        >
                            <div style={{ flex: 1, minWidth: 0, marginRight: '12px' }}>
                                <div
                                    style={{
                                        fontSize: '13px',
                                        fontWeight: 500,
                                        color: '#e7e9ea',
                                        lineHeight: 1.3,
                                        display: '-webkit-box',
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden',
                                    }}
                                >
                                    {market.groupItemTitle || market.question}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                <button
                                    onClick={() => handleYesClick(market.id, market.question, market.yesPrice)}
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        padding: '6px 10px',
                                        background: 'rgba(34, 197, 94, 0.15)',
                                        border: '1px solid rgba(34, 197, 94, 0.3)',
                                        borderRadius: '8px',
                                        minWidth: '52px',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease',
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.background = 'rgba(34, 197, 94, 0.3)';
                                        e.currentTarget.style.transform = 'scale(1.02)';
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.background = 'rgba(34, 197, 94, 0.15)';
                                        e.currentTarget.style.transform = 'scale(1)';
                                    }}
                                >
                                    <span
                                        style={{
                                            fontSize: '9px',
                                            fontWeight: 500,
                                            color: '#22c55e',
                                            marginBottom: '2px',
                                        }}
                                    >
                                        YES
                                    </span>
                                    <span
                                        style={{
                                            fontSize: '15px',
                                            fontWeight: 700,
                                            color: '#22c55e',
                                        }}
                                    >
                                        {formatPriceAsPercent(market.yesPrice)}
                                    </span>
                                </button>
                                <button
                                    onClick={() => handleNoClick(market.id, market.question, market.noPrice)}
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        padding: '6px 10px',
                                        background: 'rgba(239, 68, 68, 0.15)',
                                        border: '1px solid rgba(239, 68, 68, 0.3)',
                                        borderRadius: '8px',
                                        minWidth: '52px',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease',
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.3)';
                                        e.currentTarget.style.transform = 'scale(1.02)';
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
                                        e.currentTarget.style.transform = 'scale(1)';
                                    }}
                                >
                                    <span
                                        style={{
                                            fontSize: '9px',
                                            fontWeight: 500,
                                            color: '#ef4444',
                                            marginBottom: '2px',
                                        }}
                                    >
                                        NO
                                    </span>
                                    <span
                                        style={{
                                            fontSize: '15px',
                                            fontWeight: 700,
                                            color: '#ef4444',
                                        }}
                                    >
                                        {formatPriceAsPercent(market.noPrice)}
                                    </span>
                                </button>
                            </div>
                        </div>
                    ))
                ) : (
                    <div
                        style={{
                            textAlign: 'center',
                            padding: '16px',
                            color: '#71767b',
                            fontSize: '13px',
                        }}
                    >
                        No active markets
                    </div>
                )}

                {/* Resolved Markets Dropdown */}
                {closedMarkets.length > 0 && (
                    <div style={{ marginTop: '8px' }}>
                        <button
                            onClick={() => setShowResolved(!showResolved)}
                            style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '10px 12px',
                                background: 'rgba(113, 118, 123, 0.1)',
                                border: '1px solid rgba(113, 118, 123, 0.2)',
                                borderRadius: '10px',
                                cursor: 'pointer',
                                color: '#71767b',
                                fontSize: '12px',
                                fontWeight: 500,
                            }}
                        >
                            <span>
                                {showResolved ? '▼' : '▶'} Resolved Markets ({closedMarkets.length})
                            </span>
                        </button>

                        {showResolved && (
                            <div style={{ marginTop: '4px' }}>
                                {closedMarkets.map(market => (
                                    <div
                                        key={market.id}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '8px 12px',
                                            marginBottom: '4px',
                                            background: 'rgba(113, 118, 123, 0.08)',
                                            borderRadius: '8px',
                                            border: '1px solid rgba(113, 118, 123, 0.1)',
                                        }}
                                    >
                                        <div style={{ flex: 1, minWidth: 0, marginRight: '12px' }}>
                                            <div
                                                style={{
                                                    fontSize: '12px',
                                                    fontWeight: 500,
                                                    color: '#71767b',
                                                    lineHeight: 1.3,
                                                    display: '-webkit-box',
                                                    WebkitLineClamp: 1,
                                                    WebkitBoxOrient: 'vertical',
                                                    overflow: 'hidden',
                                                }}
                                            >
                                                {market.groupItemTitle || market.question}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                                            <div
                                                style={{
                                                    padding: '4px 8px',
                                                    background: 'rgba(113, 118, 123, 0.15)',
                                                    borderRadius: '6px',
                                                    fontSize: '12px',
                                                    fontWeight: 600,
                                                    color: market.yesPrice > 0.5 ? '#22c55e' : '#71767b',
                                                }}
                                            >
                                                {market.yesPrice > 0.5 ? 'YES ✓' : `YES ${formatPriceAsPercent(market.yesPrice)}`}
                                            </div>
                                            <div
                                                style={{
                                                    padding: '4px 8px',
                                                    background: 'rgba(113, 118, 123, 0.15)',
                                                    borderRadius: '6px',
                                                    fontSize: '12px',
                                                    fontWeight: 600,
                                                    color: market.noPrice > 0.5 ? '#ef4444' : '#71767b',
                                                }}
                                            >
                                                {market.noPrice > 0.5 ? 'NO ✓' : `NO ${formatPriceAsPercent(market.noPrice)}`}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Footer - hide when trading panel is open */}
            {!orderPanel.isOpen && (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                        background: 'rgba(0, 0, 0, 0.2)',
                    }}
                >
                    <span
                        style={{
                            fontSize: '11px',
                            color: '#71767b',
                        }}
                    >
                        Powered by Polymarket
                    </span>
                    <a
                        href={fullUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            fontSize: '11px',
                            color: '#1d9bf0',
                            textDecoration: 'none',
                        }}
                    >
                        View all on Polymarket →
                    </a>
                </div>
            )}

            {/* Inline Trading Panel for multi-market */}
            <InlineTradingPanel
                isOpen={orderPanel.isOpen}
                onClose={closeOrderPanel}
                marketTitle={orderPanel.marketQuestion || data.title}
                outcome={orderPanel.outcome}
                tokenId={orderPanel.marketId}
                price={orderPanel.price}
            />
        </div>
    );
}

function LoadingCard() {
    return (
        <div
            style={{
                background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                borderRadius: '16px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '16px',
                width: '100%',
                maxWidth: '500px',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '16px',
                }}
            >
                <div
                    style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '8px',
                        background: 'rgba(255, 255, 255, 0.1)',
                    }}
                />
                <div style={{ flex: 1 }}>
                    <div
                        style={{
                            height: '14px',
                            width: '80%',
                            borderRadius: '4px',
                            background: 'rgba(255, 255, 255, 0.1)',
                            marginBottom: '8px',
                        }}
                    />
                    <div
                        style={{
                            height: '11px',
                            width: '50%',
                            borderRadius: '4px',
                            background: 'rgba(255, 255, 255, 0.1)',
                        }}
                    />
                </div>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
                <div
                    style={{
                        flex: 1,
                        height: '80px',
                        borderRadius: '12px',
                        background: 'rgba(34, 197, 94, 0.1)',
                    }}
                />
                <div
                    style={{
                        flex: 1,
                        height: '80px',
                        borderRadius: '12px',
                        background: 'rgba(239, 68, 68, 0.1)',
                    }}
                />
            </div>
        </div>
    );
}

function ErrorCard({ message, url }: { message: string; url: string }) {
    return (
        <div
            style={{
                background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                borderRadius: '16px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '16px',
                width: '100%',
                maxWidth: '500px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
            }}
        >
            <div>
                <div style={{ fontSize: '14px', color: '#e7e9ea', marginBottom: '4px' }}>
                    Polymarket
                </div>
                <div style={{ fontSize: '12px', color: '#71767b' }}>{message}</div>
            </div>
            <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                    padding: '8px 16px',
                    background: 'rgba(29, 155, 240, 0.2)',
                    border: '1px solid rgba(29, 155, 240, 0.3)',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#1d9bf0',
                    textDecoration: 'none',
                }}
            >
                Open →
            </a>
        </div>
    );
}

function PolymarketLogo() {
    return (
        <svg
            width="24"
            height="24"
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            <circle cx="16" cy="16" r="16" fill="#00D395" />
            <path
                d="M10 10h12v12H10z"
                fill="white"
                fillOpacity="0.9"
            />
        </svg>
    );
}
