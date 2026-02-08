import { useState, useEffect } from 'react';
import {
    fetchEventBySlug,
    parseMarket,
    formatPriceAsPercent,
    formatVolume,
    formatEndDate,
    type ParsedMarket,
    type PolymarketEvent,
    theme,
    FONT_IMPORT_URL,
} from '@extension/shared';
import { InlineTradingPanel } from './InlineTradingPanel';
import { useMarketPrices } from '../../../hooks/useMarketPrices';
import { AnimatedPrice } from '../../../components/AnimatedPrice';

// Inject font stylesheet
const fontLink = document.createElement('link');
fontLink.rel = 'stylesheet';
fontLink.href = FONT_IMPORT_URL;
document.head.appendChild(fontLink);

// Theme-based styles
const styles = {
    card: {
        background: '#0d1117', // Deeper dark theme
        borderRadius: '16px',
        border: '1px solid rgba(48, 54, 61, 0.8)',
        overflow: 'hidden' as const,
        width: '100%',
        maxWidth: '520px',
        fontFamily: theme.fonts.primary,
        boxShadow: '0 12px 28px rgba(0, 0, 0, 0.5), 0 0 1px rgba(255,255,255,0.1)',
        backdropFilter: 'blur(10px)',
    },
    header: {
        position: 'relative' as const,
        minHeight: '120px',
        display: 'flex' as const,
        flexDirection: 'column' as const,
        background: 'rgba(22, 27, 34, 0.8)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(48, 54, 61, 0.6)',
    },
    headerBg: {
        position: 'absolute' as const,
        top: 0,
        right: 0,
        bottom: 0,
        width: '65%',
        zIndex: 0,
    },
    headerImage: {
        width: '100%',
        height: '100%',
        objectFit: 'cover' as const,
        maskImage: 'linear-gradient(to left, black 50%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to left, black 50%, transparent 100%)',
        opacity: 0.8,
        filter: 'sepia(10%) contrast(1.1)',
        transition: 'all 0.5s ease',
    },
    headerContent: {
        position: 'relative' as const,
        zIndex: 1,
        padding: '18px 20px',
        display: 'flex' as const,
        justifyContent: 'space-between',
        alignItems: 'flex-start' as const,
        height: '100%',
        background: 'transparent',
    },
    title: {
        fontSize: '17px',
        fontWeight: 700,
        color: '#f0f6fc',
        lineHeight: 1.3,
        marginBottom: '8px',
        textShadow: '0 2px 8px rgba(0,0,0,0.6)',
        letterSpacing: '-0.3px',
    },
    meta: {
        fontSize: '12px',
        color: '#8b949e',
        display: 'flex' as const,
        alignItems: 'center' as const,
        gap: '8px',
        fontWeight: 500,
    },
    priceContainer: {
        display: 'flex' as const,
        gap: '12px',
        padding: '16px 20px',
        background: '#0d1117',
    },
    yesButton: {
        flex: 1,
        display: 'flex' as const,
        flexDirection: 'column' as const,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        padding: '16px',
        background: 'linear-gradient(145deg, rgba(0, 217, 146, 0.12) 0%, rgba(0, 217, 146, 0.04) 100%)',
        border: '1px solid rgba(0, 217, 146, 0.3)',
        borderRadius: '12px',
        cursor: 'pointer',
        transition: 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        fontFamily: theme.fonts.primary,
        boxShadow: '0 4px 12px rgba(0, 217, 146, 0.08), inset 0 1px 1px rgba(255,255,255,0.05)',
        position: 'relative' as const,
        overflow: 'hidden' as const,
    },
    noButton: {
        flex: 1,
        display: 'flex' as const,
        flexDirection: 'column' as const,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        padding: '16px',
        background: 'linear-gradient(145deg, rgba(255, 107, 107, 0.12) 0%, rgba(255, 107, 107, 0.04) 100%)',
        border: '1px solid rgba(255, 107, 107, 0.3)',
        borderRadius: '12px',
        cursor: 'pointer',
        transition: 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        fontFamily: theme.fonts.primary,
        boxShadow: '0 4px 12px rgba(255, 107, 107, 0.08), inset 0 1px 1px rgba(255,255,255,0.05)',
        position: 'relative' as const,
        overflow: 'hidden' as const,
    },
    footer: {
        display: 'flex' as const,
        alignItems: 'center' as const,
        justifyContent: 'space-between' as const,
        padding: '12px 20px',
        borderTop: '1px solid rgba(48, 54, 61, 0.6)',
        background: 'rgba(22, 27, 34, 0.5)',
    },
};

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
        acceptingOrders: boolean;
        clobTokenIds: string[];  // [yesTokenId, noTokenId] for order placement
        outcomes: string[];  // e.g., ["Yes", "No"] or ["Up", "Down"]
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
                            acceptingOrders: parsed.acceptingOrders,
                            clobTokenIds: parsed.clobTokenIds,  // Include token IDs for order placement
                            outcomes: parsed.outcomes,  // Include outcome labels (e.g., ["Up", "Down"])
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
    
    // Get outcome labels from API (e.g., ["Up", "Down"] or ["Yes", "No"])
    const outcome1Label = market.outcomes[0] || 'Yes';
    const outcome2Label = market.outcomes[1] || 'No';
    
    // Check if market is resolved (closed or not accepting orders and end date passed)
    const now = new Date();
    const endDate = market.endDate ? new Date(market.endDate) : null;
    const isResolved = market.closed || (!market.acceptingOrders && endDate && endDate < now);
    
    // Determine winner based on prices (if resolved, the one at ~1.00 is the winner)
    const outcome1Wins = isResolved && market.outcomePrices[0] > 0.9;
    const outcome2Wins = isResolved && market.outcomePrices[1] > 0.9;
    
    // Use live prices from WebSocket, falling back to initial API prices
    const initialYesPrice = market.outcomePrices[0] ?? 0.5;
    const initialNoPrice = market.outcomePrices[1] ?? 0.5;
    
    const livePrices = useMarketPrices(
        market.clobTokenIds[0],  // Outcome 1 token ID
        market.clobTokenIds[1],  // Outcome 2 token ID
        { initialYesPrice, initialNoPrice }
    );
    
    // Always use the prices from the hook (it manages fallback internally)
    const yesPrice = livePrices.yes;
    const noPrice = livePrices.no;

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
        <div style={styles.card}>
            {/* Header */}
            <div style={styles.header}>
                <div style={styles.headerBg}>
                    {eventImage && (
                        <img
                            src={eventImage}
                            alt=""
                            style={styles.headerImage}
                        />
                    )}
                </div>
                <div style={styles.headerContent}>
                    <div style={{ flex: 1, paddingRight: '40%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <div style={styles.title}>
                            {title}
                        </div>
                        <div style={styles.meta}>
                            <span>{formatEndDate(market.endDate)}</span>
                            <span>•</span>
                            <span>Vol: {formatVolume(market.volume)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Price Display */}
            {isResolved ? (
                /* Resolved Market Display */
                <div style={styles.priceContainer}>
                    <div
                        style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '16px',
                            background: outcome1Wins 
                                ? 'linear-gradient(145deg, rgba(0, 217, 146, 0.2) 0%, rgba(0, 217, 146, 0.08) 100%)'
                                : 'rgba(30, 35, 42, 0.5)',
                            border: outcome1Wins 
                                ? '2px solid rgba(0, 217, 146, 0.6)'
                                : '1px solid rgba(48, 54, 61, 0.4)',
                            borderRadius: '12px',
                            fontFamily: theme.fonts.primary,
                            position: 'relative',
                        }}
                    >
                        {outcome1Wins && (
                            <span style={{
                                position: 'absolute',
                                top: '8px',
                                right: '8px',
                                fontSize: '16px',
                            }}>✓</span>
                        )}
                        <span style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            color: outcome1Wins ? theme.colors.accent : theme.colors.textMuted,
                            marginBottom: '4px',
                            letterSpacing: '0.5px',
                            textTransform: 'uppercase',
                        }}>
                            {outcome1Label}
                        </span>
                        <span style={{
                            fontSize: '22px',
                            fontWeight: 700,
                            color: outcome1Wins ? theme.colors.accent : theme.colors.textMuted,
                            fontFamily: theme.fonts.mono,
                        }}>
                            {outcome1Wins ? 'WON' : 'LOST'}
                        </span>
                    </div>
                    <div
                        style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '16px',
                            background: outcome2Wins 
                                ? 'linear-gradient(145deg, rgba(0, 217, 146, 0.2) 0%, rgba(0, 217, 146, 0.08) 100%)'
                                : 'rgba(30, 35, 42, 0.5)',
                            border: outcome2Wins 
                                ? '2px solid rgba(0, 217, 146, 0.6)'
                                : '1px solid rgba(48, 54, 61, 0.4)',
                            borderRadius: '12px',
                            fontFamily: theme.fonts.primary,
                            position: 'relative',
                        }}
                    >
                        {outcome2Wins && (
                            <span style={{
                                position: 'absolute',
                                top: '8px',
                                right: '8px',
                                fontSize: '16px',
                            }}>✓</span>
                        )}
                        <span style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            color: outcome2Wins ? theme.colors.accent : theme.colors.textMuted,
                            marginBottom: '4px',
                            letterSpacing: '0.5px',
                            textTransform: 'uppercase',
                        }}>
                            {outcome2Label}
                        </span>
                        <span style={{
                            fontSize: '22px',
                            fontWeight: 700,
                            color: outcome2Wins ? theme.colors.accent : theme.colors.textMuted,
                            fontFamily: theme.fonts.mono,
                        }}>
                            {outcome2Wins ? 'WON' : 'LOST'}
                        </span>
                    </div>
                </div>
            ) : (
                /* Active Market Display */
                <div style={styles.priceContainer}>
                    {/* Outcome 1 Button */}
                    <button
                        onClick={() => openOrderPanel('YES', yesPrice)}
                        style={styles.yesButton}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(0, 217, 146, 0.25)';
                            e.currentTarget.style.transform = 'scale(1.02)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = theme.colors.accentGlow;
                            e.currentTarget.style.transform = 'scale(1)';
                        }}
                    >
                        <span
                            style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                color: theme.colors.accent,
                                marginBottom: '2px',
                                letterSpacing: '0.5px',
                                textTransform: 'uppercase',
                            }}
                        >
                            {outcome1Label}
                        </span>
                        <AnimatedPrice
                            price={yesPrice}
                            format="percent"
                            fontSize={26}
                            fontWeight={700}
                            color={theme.colors.accent}
                            fontFamily={theme.fonts.mono}
                            isLive={livePrices.isLive}
                        />
                        <span
                            style={{
                                fontSize: '10px',
                                color: theme.colors.textMuted,
                                marginTop: '2px',
                                fontFamily: theme.fonts.mono,
                            }}
                        >
                            <AnimatedPrice
                                price={yesPrice}
                                format="cents"
                                fontSize={10}
                                fontWeight={400}
                                color={theme.colors.textMuted}
                                fontFamily={theme.fonts.mono}
                            />
                            /share
                        </span>
                    </button>

                    {/* Outcome 2 Button */}
                    <button
                        onClick={() => openOrderPanel('NO', noPrice)}
                        style={styles.noButton}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 107, 107, 0.25)';
                            e.currentTarget.style.transform = 'scale(1.02)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 107, 107, 0.15)';
                            e.currentTarget.style.transform = 'scale(1)';
                        }}
                    >
                        <span
                            style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                color: theme.colors.accentSell,
                                marginBottom: '2px',
                                letterSpacing: '0.5px',
                                textTransform: 'uppercase',
                            }}
                        >
                            {outcome2Label}
                        </span>
                        <AnimatedPrice
                            price={noPrice}
                            format="percent"
                            fontSize={26}
                            fontWeight={700}
                            color={theme.colors.accentSell}
                            fontFamily={theme.fonts.mono}
                            isLive={livePrices.isLive}
                        />
                        <span
                            style={{
                                fontSize: '10px',
                                color: theme.colors.textMuted,
                                marginTop: '2px',
                                fontFamily: theme.fonts.mono,
                            }}
                        >
                            <AnimatedPrice
                                price={noPrice}
                                format="cents"
                                fontSize={10}
                                fontWeight={400}
                                color={theme.colors.textMuted}
                                fontFamily={theme.fonts.mono}
                            />
                            /share
                        </span>
                    </button>
                </div>
            )}

            {/* Footer - hide when trading panel is open */}
            {!orderPanel.isOpen && (
                <div style={styles.footer}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                            style={{
                                fontSize: '10px',
                                color: theme.colors.textMuted,
                            }}
                        >
                            Powered by Polymarket
                        </span>
                        {isResolved ? (
                            <span
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    fontSize: '9px',
                                    fontWeight: 600,
                                    color: theme.colors.textMuted,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px',
                                    background: 'rgba(139, 148, 158, 0.2)',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                }}
                            >
                                RESOLVED
                            </span>
                        ) : (
                            livePrices.isLive && <LiveIndicator />
                        )}
                    </div>
                    <a
                        href={fullUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            fontSize: '11px',
                            color: theme.colors.accent,
                            textDecoration: 'none',
                            fontWeight: 500,
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

// Live indicator component
function LiveIndicator() {
    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '9px',
                fontWeight: 600,
                color: theme.colors.accent,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
            }}
        >
            <span
                style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: theme.colors.accent,
                    animation: 'pulse 2s ease-in-out infinite',
                }}
            />
            LIVE
        </span>
    );
}

// Individual market row with live prices for multi-market display
interface MarketPriceRowProps {
    market: {
        id: string;
        question: string;
        groupItemTitle?: string;
        yesPrice: number;
        noPrice: number;
        clobTokenIds: string[];
        outcomes: string[];  // e.g., ["Yes", "No"] or ["Up", "Down"]
    };
    onYesClick: (clobTokenIds: string[], question: string, price: number) => void;
    onNoClick: (clobTokenIds: string[], question: string, price: number) => void;
}

function MarketPriceRow({ market, onYesClick, onNoClick }: MarketPriceRowProps) {
    // Get outcome labels from market data
    const outcome1Label = market.outcomes?.[0] || 'Yes';
    const outcome2Label = market.outcomes?.[1] || 'No';
    
    // Use live prices from WebSocket
    const livePrices = useMarketPrices(
        market.clobTokenIds[0],  // Outcome 1 token ID
        market.clobTokenIds[1],  // Outcome 2 token ID
        { initialYesPrice: market.yesPrice, initialNoPrice: market.noPrice }
    );
    
    // Always use the prices from the hook (it manages fallback internally)
    const yesPrice = livePrices.yes;
    const noPrice = livePrices.no;
    
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                marginBottom: '4px',
                background: theme.colors.bgCard,
                borderRadius: theme.radius.md,
                border: `1px solid ${theme.colors.borderSubtle}`,
            }}
        >
            <div style={{ flex: 1, minWidth: 0, marginRight: '12px' }}>
                <div
                    style={{
                        fontSize: '12px',
                        fontWeight: 500,
                        color: theme.colors.textPrimary,
                        lineHeight: 1.3,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                    }}
                >
                    {market.groupItemTitle || market.question}
                </div>
                {livePrices.isLive && (
                    <div style={{ marginTop: '4px' }}>
                        <LiveIndicator />
                    </div>
                )}
            </div>
            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                <button
                    onClick={() => onYesClick(market.clobTokenIds, market.question, yesPrice)}
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        padding: '6px 10px',
                        background: theme.colors.accentGlow,
                        border: `1px solid ${theme.colors.accent}33`,
                        borderRadius: theme.radius.sm,
                        minWidth: '50px',
                        cursor: 'pointer',
                        transition: theme.transitions.fast,
                        fontFamily: theme.fonts.primary,
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.background = 'rgba(0, 217, 146, 0.3)';
                        e.currentTarget.style.transform = 'scale(1.02)';
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.background = theme.colors.accentGlow;
                        e.currentTarget.style.transform = 'scale(1)';
                    }}
                >
                    <span
                        style={{
                            fontSize: '9px',
                            fontWeight: 600,
                            color: theme.colors.accent,
                            marginBottom: '2px',
                            textTransform: 'uppercase',
                        }}
                    >
                        {outcome1Label}
                    </span>
                    <AnimatedPrice
                        price={yesPrice}
                        format="percent"
                        fontSize={14}
                        fontWeight={700}
                        color={theme.colors.accent}
                        fontFamily={theme.fonts.mono}
                    />
                </button>
                <button
                    onClick={() => onNoClick(market.clobTokenIds, market.question, noPrice)}
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        padding: '6px 10px',
                        background: 'rgba(255, 107, 107, 0.15)',
                        border: `1px solid ${theme.colors.accentSell}33`,
                        borderRadius: theme.radius.sm,
                        minWidth: '50px',
                        cursor: 'pointer',
                        transition: theme.transitions.fast,
                        fontFamily: theme.fonts.primary,
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.background = 'rgba(255, 107, 107, 0.3)';
                        e.currentTarget.style.transform = 'scale(1.02)';
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.background = 'rgba(255, 107, 107, 0.15)';
                        e.currentTarget.style.transform = 'scale(1)';
                    }}
                >
                    <span
                        style={{
                            fontSize: '9px',
                            fontWeight: 600,
                            color: theme.colors.accentSell,
                            marginBottom: '2px',
                            textTransform: 'uppercase',
                        }}
                    >
                        {outcome2Label}
                    </span>
                    <AnimatedPrice
                        price={noPrice}
                        format="percent"
                        fontSize={14}
                        fontWeight={700}
                        color={theme.colors.accentSell}
                        fontFamily={theme.fonts.mono}
                    />
                </button>
            </div>
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
        tokenId: string;  // The CLOB token ID for the selected outcome
        marketQuestion: string;
    }>({ isOpen: false, outcome: 'YES', price: 0.5, tokenId: '', marketQuestion: '' });

    const openOrderPanel = (clobTokenIds: string[], marketQuestion: string, outcome: 'YES' | 'NO', price: number) => {
        // Select the correct token ID based on outcome: index 0 = YES, index 1 = NO
        const tokenId = outcome === 'YES' ? clobTokenIds[0] : clobTokenIds[1];
        setOrderPanel({ isOpen: true, outcome, price, tokenId, marketQuestion });
    };

    const closeOrderPanel = () => {
        setOrderPanel({ ...orderPanel, isOpen: false });
    };

    const handleYesClick = (clobTokenIds: string[], marketQuestion: string, yesPrice: number) => {
        openOrderPanel(clobTokenIds, marketQuestion, 'YES', yesPrice);
    };

    const handleNoClick = (clobTokenIds: string[], marketQuestion: string, noPrice: number) => {
        openOrderPanel(clobTokenIds, marketQuestion, 'NO', noPrice);
    };

    return (
        <div style={styles.card}>
            {/* Header */}
            <div style={styles.header}>
                <div style={styles.headerBg}>
                    {data.eventImage && (
                        <img
                            src={data.eventImage}
                            alt=""
                            style={styles.headerImage}
                        />
                    )}
                </div>
                <div style={styles.headerContent}>
                    <div style={{ flex: 1, paddingRight: '40%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <div style={styles.title}>
                            {data.title}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                            <span
                                style={{
                                    fontSize: '10px',
                                    fontWeight: 600,
                                    color: theme.colors.accent,
                                    background: 'rgba(0, 217, 146, 0.1)',
                                    padding: '2px 8px',
                                    borderRadius: '10px',
                                    border: '1px solid rgba(0, 217, 146, 0.2)',
                                }}
                            >
                                {activeMarkets.length} active
                            </span>
                            <span style={styles.meta}>
                                Vol: {formatVolume(data.totalVolume)}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Active Markets List */}
            <div
                style={{
                    maxHeight: '280px',
                    overflowY: 'auto',
                    padding: theme.spacing.sm,
                    background: theme.colors.bgPrimary,
                }}
            >
                {activeMarkets.length > 0 ? (
                    activeMarkets.map(market => (
                        <MarketPriceRow
                            key={market.id}
                            market={market}
                            onYesClick={handleYesClick}
                            onNoClick={handleNoClick}
                        />
                    ))
                ) : (
                    <div
                        style={{
                            textAlign: 'center',
                            padding: theme.spacing.lg,
                            color: theme.colors.textMuted,
                            fontSize: '12px',
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
                                background: theme.colors.bgTertiary,
                                border: `1px solid ${theme.colors.borderSubtle}`,
                                borderRadius: theme.radius.md,
                                cursor: 'pointer',
                                color: theme.colors.textMuted,
                                fontSize: '11px',
                                fontWeight: 500,
                                fontFamily: theme.fonts.primary,
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
                                            background: theme.colors.bgTertiary,
                                            borderRadius: theme.radius.sm,
                                            border: `1px solid ${theme.colors.borderSubtle}`,
                                        }}
                                    >
                                        <div style={{ flex: 1, minWidth: 0, marginRight: '12px' }}>
                                            <div
                                                style={{
                                                    fontSize: '11px',
                                                    fontWeight: 500,
                                                    color: theme.colors.textMuted,
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
                                                    background: theme.colors.bgTertiary,
                                                    borderRadius: theme.radius.sm,
                                                    fontSize: '11px',
                                                    fontWeight: 600,
                                                    fontFamily: theme.fonts.mono,
                                                    color: market.yesPrice > 0.5 ? theme.colors.accent : theme.colors.textMuted,
                                                }}
                                            >
                                                {market.yesPrice > 0.5 ? 'YES ✓' : `YES ${formatPriceAsPercent(market.yesPrice)}`}
                                            </div>
                                            <div
                                                style={{
                                                    padding: '4px 8px',
                                                    background: theme.colors.bgTertiary,
                                                    borderRadius: theme.radius.sm,
                                                    fontSize: '11px',
                                                    fontWeight: 600,
                                                    fontFamily: theme.fonts.mono,
                                                    color: market.noPrice > 0.5 ? theme.colors.accentSell : theme.colors.textMuted,
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
                <div style={styles.footer}>
                    <span
                        style={{
                            fontSize: '10px',
                            color: '#8b949e',
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
                            color: theme.colors.accent,
                            textDecoration: 'none',
                            fontWeight: 500,
                        }}
                    >
                        View on Polymarket →
                    </a>
                </div>
            )}

            {/* Inline Trading Panel for multi-market */}
            <InlineTradingPanel
                isOpen={orderPanel.isOpen}
                onClose={closeOrderPanel}
                marketTitle={orderPanel.marketQuestion || data.title}
                outcome={orderPanel.outcome}
                tokenId={orderPanel.tokenId}
                price={orderPanel.price}
            />
        </div>
    );
}

function LoadingCard() {
    return (
        <div
            style={{
                background: theme.colors.bgPrimary,
                borderRadius: theme.radius.lg,
                border: `1px solid ${theme.colors.borderSubtle}`,
                padding: theme.spacing.lg,
                width: '100%',
                maxWidth: '500px',
                fontFamily: theme.fonts.primary,
            }}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: theme.spacing.md,
                    marginBottom: theme.spacing.lg,
                }}
            >
                <div
                    style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: theme.radius.md,
                        background: theme.colors.bgTertiary,
                        animation: 'pulse 1.5s ease-in-out infinite',
                    }}
                />
                <div style={{ flex: 1 }}>
                    <div
                        style={{
                            height: '12px',
                            width: '80%',
                            borderRadius: theme.radius.xs,
                            background: theme.colors.bgTertiary,
                            marginBottom: theme.spacing.sm,
                        }}
                    />
                    <div
                        style={{
                            height: '10px',
                            width: '50%',
                            borderRadius: theme.radius.xs,
                            background: theme.colors.bgTertiary,
                        }}
                    />
                </div>
            </div>
            <div style={{ display: 'flex', gap: theme.spacing.md }}>
                <div
                    style={{
                        flex: 1,
                        height: '70px',
                        borderRadius: theme.radius.md,
                        background: `${theme.colors.accent}15`,
                    }}
                />
                <div
                    style={{
                        flex: 1,
                        height: '70px',
                        borderRadius: theme.radius.md,
                        background: `${theme.colors.accentSell}15`,
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
                background: theme.colors.bgPrimary,
                borderRadius: theme.radius.lg,
                border: `1px solid ${theme.colors.borderSubtle}`,
                padding: theme.spacing.lg,
                width: '100%',
                maxWidth: '500px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontFamily: theme.fonts.primary,
            }}
        >
            <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: theme.colors.textPrimary, marginBottom: '4px' }}>
                    Polymarket
                </div>
                <div style={{ fontSize: '11px', color: theme.colors.textMuted }}>{message}</div>
            </div>
            <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                    padding: '8px 14px',
                    background: `${theme.colors.accent}20`,
                    border: `1px solid ${theme.colors.accent}40`,
                    borderRadius: theme.radius.md,
                    fontSize: '11px',
                    fontWeight: 600,
                    color: theme.colors.accent,
                    textDecoration: 'none',
                    transition: theme.transitions.fast,
                }}
            >
                Open →
            </a>
        </div>
    );
}

function InsiderLogo() {
    return (
        <span
            style={{
                fontSize: '10px',
                fontWeight: 600,
                color: theme.colors.textMuted,
                fontFamily: theme.fonts.primary,
                letterSpacing: '0.5px',
            }}
        >
            INSIDER
        </span>
    );
}
