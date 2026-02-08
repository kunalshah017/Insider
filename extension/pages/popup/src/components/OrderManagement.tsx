/**
 * OrderManagement component
 *
 * Displays holdings and orders (open + executed) from the CLOB API
 */

import React, { useState, useEffect, useCallback } from 'react';

interface Order {
    id: string;
    asset_id?: string;
    tokenId?: string;
    market?: string;
    maker_address?: string;
    side: string;
    price: string;
    original_size?: string;
    size?: string;
    size_matched?: string;
    outcome?: string;
    status: string;
    created_at?: string | number;
    createdAt?: string | number;
    expiration?: string;
}

interface MakerOrder {
    order_id: string;
    owner?: string;
    maker_address: string;
    matched_amount: string;
    price: string;
    fee_rate_bps?: string;
    asset_id?: string;
    outcome?: string;
    side: string;
}

interface Trade {
    id: string;
    taker_order_id?: string;
    market?: string;
    asset_id?: string;
    side: string;
    price: string;
    size: string;
    fee_rate_bps?: string;
    status?: string;
    match_time?: string;
    created_at?: string;
    outcome?: string;
    owner?: string;
    maker_address?: string;
    type?: string;
    transaction_hash?: string;
    bucket_index?: string;
    trader_side?: string;
    title?: string;
    maker_orders?: MakerOrder[];
}

interface Position {
    id?: string;
    asset?: string;
    conditionId?: string;
    outcomeIndex?: number;
    title?: string;
    question?: string;
    size: number | string;
    avgPrice?: number | string;
    currentPrice?: number | string;
    curPrice?: number | string;
    currentValue?: number | string;
    initialValue?: number | string;
    cashPnl?: number | string;
    percentPnl?: number | string;
    pnl?: string;
    pnlPercent?: string;
    outcome?: string;
    redeemable?: boolean;
    resolved?: boolean;
    icon?: string;
    slug?: string;
    eventSlug?: string;
    endDate?: string;
    market?: {
        slug?: string;
        question?: string;
        outcome?: string;
    };
}

interface ApiResponse {
    data?: any[];
    error?: string;
    next_cursor?: string;
    count?: number;
}

interface OrderManagementProps {
    activeTab: 'holdings' | 'orders';
}

interface SellModalState {
    isOpen: boolean;
    position: Position | null;
}

export function OrderManagement({ activeTab }: OrderManagementProps) {
    const [orders, setOrders] = useState<Order[]>([]);
    const [trades, setTrades] = useState<Trade[]>([]);
    const [positions, setPositions] = useState<Position[]>([]);
    const [userWallet, setUserWallet] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [cancellingId, setCancellingId] = useState<string | null>(null);

    // Sell modal state
    const [sellModal, setSellModal] = useState<SellModalState>({ isOpen: false, position: null });
    const [sellAmount, setSellAmount] = useState<string>('');
    const [sellPriceCents, setSellPriceCents] = useState<string>('');
    const [sellOrderType, setSellOrderType] = useState<'market' | 'limit'>('market');
    const [isSelling, setIsSelling] = useState(false);
    const [sellError, setSellError] = useState<string | null>(null);
    const [sellSuccess, setSellSuccess] = useState<string | null>(null);

    // Fetch user wallet address on mount
    useEffect(() => {
        const getWallet = async () => {
            try {
                const result = await chrome.storage.local.get('insider_trading_session');
                const session = result.insider_trading_session;
                if (session) {
                    const address = session.eoaAddress || session.walletAddress || '';
                    setUserWallet(address.toLowerCase());
                }
            } catch (err) {
                console.error('[OrderManagement] Error getting wallet:', err);
            }
        };
        getWallet();
    }, []);

    const fetchOrders = useCallback(async () => {
        try {
            const apiResponse: ApiResponse = await chrome.runtime.sendMessage({
                type: 'FETCH_OPEN_ORDERS',
            });

            const localResponse: ApiResponse = await chrome.runtime.sendMessage({
                type: 'GET_LOCAL_ORDERS',
            });

            const localOrders = Array.isArray(localResponse.data) ? localResponse.data : [];

            if (apiResponse.error) {
                // Filter local orders for live status (case-insensitive)
                const liveLocalOrders = localOrders.filter((o) => o.status?.toLowerCase() === 'live');
                setOrders(liveLocalOrders);
            } else if (apiResponse.data) {
                // Filter API orders for live/open status (case-insensitive)
                const apiOrders = Array.isArray(apiResponse.data)
                    ? apiResponse.data.filter((o) => {
                        const status = o.status?.toLowerCase();
                        return status === 'live' || status === 'open';
                    })
                    : [];
                setOrders(apiOrders);
            }
        } catch (err) {
            console.error('[OrderManagement] Error fetching orders:', err);
        }
    }, []);

    const fetchTradeHistory = useCallback(async () => {
        try {
            const response: ApiResponse = await chrome.runtime.sendMessage({
                type: 'FETCH_TRADE_HISTORY',
            });

            if (response.data) {
                setTrades(Array.isArray(response.data) ? response.data : []);
            }
        } catch (err) {
            console.error('[OrderManagement] Error fetching trade history:', err);
        }
    }, []);

    const fetchPositions = useCallback(async () => {
        try {
            const response: ApiResponse = await chrome.runtime.sendMessage({
                type: 'FETCH_POSITIONS',
            });

            if (response.error && response.error !== 'No trading session') {
                setError(response.error);
            } else if (response.data) {
                setPositions(Array.isArray(response.data) ? response.data : []);
            }
        } catch (err) {
            console.error('[OrderManagement] Error fetching positions:', err);
            setError(String(err));
        }
    }, []);

    const fetchAll = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        await Promise.all([fetchPositions(), fetchOrders(), fetchTradeHistory()]);
        setIsLoading(false);
    }, [fetchPositions, fetchOrders, fetchTradeHistory]);

    useEffect(() => {
        fetchAll();
        const interval = setInterval(fetchAll, 30000);
        return () => clearInterval(interval);
    }, [fetchAll]);

    const handleCancelOrder = async (orderId: string) => {
        setCancellingId(orderId);
        try {
            const response: ApiResponse = await chrome.runtime.sendMessage({
                type: 'CANCEL_ORDER',
                orderId,
            });

            if (response.error) {
                setError(response.error);
            } else {
                setOrders((prev) => prev.filter((o) => o.id !== orderId));
            }
        } catch (err) {
            setError(String(err));
        } finally {
            setCancellingId(null);
        }
    };

    // Sell modal handlers
    const openSellModal = (position: Position) => {
        const curPrice = position.curPrice || position.currentPrice || 0;
        const priceNum = typeof curPrice === 'string' ? parseFloat(curPrice) : curPrice;
        const sizeNum = typeof position.size === 'string' ? parseFloat(position.size) : position.size;

        setSellModal({ isOpen: true, position });
        setSellAmount(sizeNum.toFixed(2));
        setSellPriceCents(Math.round(priceNum * 100).toString());
        setSellOrderType('market');
        setSellError(null);
        setSellSuccess(null);
    };

    const closeSellModal = () => {
        setSellModal({ isOpen: false, position: null });
        setSellAmount('');
        setSellPriceCents('');
        setSellOrderType('market');
        setSellError(null);
        setSellSuccess(null);
    };

    const handleSellSubmit = async () => {
        if (!sellModal.position) return;

        const amount = parseFloat(sellAmount);
        const curPrice = sellModal.position.curPrice || sellModal.position.currentPrice || 0;
        const marketPrice = typeof curPrice === 'string' ? parseFloat(curPrice) : curPrice;

        // For market orders, use current price; for limit, use user's price in cents
        const effectivePrice = sellOrderType === 'market'
            ? marketPrice
            : (parseFloat(sellPriceCents) || 0) / 100;

        const maxSize = typeof sellModal.position.size === 'string'
            ? parseFloat(sellModal.position.size)
            : sellModal.position.size;

        if (isNaN(amount) || amount <= 0) {
            setSellError('Please enter a valid amount');
            return;
        }

        if (amount > maxSize) {
            setSellError(`Maximum ${maxSize.toFixed(2)} shares available`);
            return;
        }

        if (sellOrderType === 'limit') {
            const priceCents = parseFloat(sellPriceCents) || 0;
            if (priceCents < 1 || priceCents > 99) {
                setSellError('Limit price must be between 1¢ and 99¢');
                return;
            }
        }

        if (effectivePrice <= 0 || effectivePrice >= 1) {
            setSellError('Invalid price');
            return;
        }

        setIsSelling(true);
        setSellError(null);

        try {
            const tokenId = sellModal.position.asset;

            if (!tokenId) {
                setSellError('Missing token ID for this position');
                setIsSelling(false);
                return;
            }

            const response: ApiResponse = await chrome.runtime.sendMessage({
                type: 'SELL_SHARES',
                tokenId,
                size: amount.toString(),
                price: effectivePrice.toString(),
            });

            if (response.error) {
                setSellError(response.error);
            } else {
                const orderTypeLabel = sellOrderType === 'market' ? 'Market sell' : 'Limit sell';
                setSellSuccess(`${orderTypeLabel} placed: ${amount.toFixed(2)} shares at ${Math.round(effectivePrice * 100)}¢`);
                // Refresh data after successful sell
                setTimeout(() => {
                    fetchAll();
                    closeSellModal();
                }, 2000);
            }
        } catch (err) {
            setSellError(String(err));
        } finally {
            setIsSelling(false);
        }
    };

    const formatPrice = (price: string | number) => {
        const p = typeof price === 'string' ? parseFloat(price) : price;
        return `${(p * 100).toFixed(1)}¢`;
    };

    const formatSize = (order: Order) => {
        if (order.original_size) {
            const orig = parseFloat(order.original_size);
            const match = parseFloat(order.size_matched || '0');
            return (orig - match).toFixed(2);
        }
        return parseFloat(order.size || '0').toFixed(2);
    };

    const formatTime = (timestamp?: string | number) => {
        if (!timestamp) return '';
        let date: Date;
        
        // Handle both number and string timestamps
        if (typeof timestamp === 'number') {
            // Unix timestamp (seconds)
            date = new Date(timestamp * 1000);
        } else {
            const num = parseInt(timestamp, 10);
            if (!isNaN(num) && /^\d+$/.test(timestamp)) {
                // String that looks like a Unix timestamp
                date = new Date(num * 1000);
            } else {
                // ISO date string or other format
                date = new Date(timestamp);
            }
        }
        
        if (isNaN(date.getTime())) return '';

        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        return `${diffDays}d ago`;
    };

    const formatPnl = (value: number | string | undefined) => {
        if (value === undefined || value === null) return null;
        const num = typeof value === 'string' ? parseFloat(value) : value;
        if (isNaN(num)) return null;
        const isPositive = num >= 0;
        return { value: num, isPositive, formatted: `${isPositive ? '+' : ''}$${Math.abs(num).toFixed(2)}` };
    };

    if (isLoading) {
        return (
            <div className="content-loading">
                <div className="loading-spinner-small" />
                <span>Loading...</span>
            </div>
        );
    }

    // Holdings Tab
    if (activeTab === 'holdings') {
        return (
            <div className="tab-content">
                <div className="content-header">
                    <span className="content-count">{positions.length} position{positions.length !== 1 ? 's' : ''}</span>
                    <button className="refresh-btn-small" onClick={fetchAll} title="Refresh">↻</button>
                </div>

                {error && <div className="content-error">{error}</div>}

                {positions.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">���</div>
                        <h3>No Holdings</h3>
                        <p>Your positions will appear here after trading</p>
                    </div>
                ) : (
                    <div className="holdings-list">
                        {positions.map((position, index) => {
                            const title = position.title || position.question || 'Unknown Market';
                            const outcome = position.outcome || '';
                            const size = typeof position.size === 'string' ? parseFloat(position.size) : position.size;
                            const curPrice = position.curPrice || position.currentPrice || 0;
                            const price = typeof curPrice === 'string' ? parseFloat(curPrice) : curPrice;
                            const value = position.currentValue ?
                                (typeof position.currentValue === 'string' ? parseFloat(position.currentValue) : position.currentValue) :
                                (size * price);
                            const pnlData = formatPnl(position.cashPnl);
                            const pnlPercent = position.percentPnl ?
                                (typeof position.percentPnl === 'string' ? parseFloat(position.percentPnl) : position.percentPnl) : 0;

                            return (
                                <div key={position.conditionId || index} className="holding-card">
                                    <div className="holding-header">
                                        {position.icon && (
                                            <img src={position.icon} alt="" className="holding-icon" />
                                        )}
                                        <div className="holding-info">
                                            <span className={`outcome-pill ${outcome.toLowerCase()}`}>
                                                {outcome}
                                            </span>
                                            {position.redeemable && (
                                                <span className="redeemable-pill">Redeemable</span>
                                            )}
                                        </div>
                                    </div>

                                    <h4 className="holding-title">{title}</h4>

                                    <div className="holding-stats">
                                        <div className="stat-group">
                                            <div className="stat-item">
                                                <span className="stat-label">Shares</span>
                                                <span className="stat-value">{size.toFixed(2)}</span>
                                            </div>
                                            <div className="stat-item">
                                                <span className="stat-label">Avg Price</span>
                                                <span className="stat-value">{formatPrice(position.avgPrice || 0)}</span>
                                            </div>
                                            <div className="stat-item">
                                                <span className="stat-label">Current</span>
                                                <span className="stat-value">{formatPrice(price)}</span>
                                            </div>
                                        </div>
                                        <div className="stat-group value-group">
                                            <div className="stat-item">
                                                <span className="stat-label">Value</span>
                                                <span className="stat-value">${value.toFixed(2)}</span>
                                            </div>
                                            {pnlData && (
                                                <div className="stat-item">
                                                    <span className="stat-label">P&L</span>
                                                    <span className={`stat-value pnl ${pnlData.isPositive ? 'positive' : 'negative'}`}>
                                                        {pnlData.formatted}
                                                        {pnlPercent !== 0 && (
                                                            <span className="pnl-percent">
                                                                ({pnlPercent >= 0 ? '+' : ''}{(pnlPercent * 100).toFixed(1)}%)
                                                            </span>
                                                        )}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="holding-actions">
                                        <button
                                            className="sell-btn"
                                            onClick={() => openSellModal(position)}
                                            disabled={position.redeemable}
                                        >
                                            {position.redeemable ? 'Redeem' : 'Sell'}
                                        </button>
                                        {position.endDate && (
                                            <span className="end-date">Ends: {new Date(position.endDate).toLocaleDateString()}</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Sell Modal */}
                {sellModal.isOpen && sellModal.position && (
                    <div className="sell-modal-overlay" onClick={closeSellModal}>
                        <div className="sell-modal" onClick={(e) => e.stopPropagation()}>
                            <div className="sell-modal-header">
                                <h3>Sell Position</h3>
                                <button className="modal-close-btn" onClick={closeSellModal}>✕</button>
                            </div>

                            <div className="sell-modal-content">
                                <div className="sell-position-info">
                                    <span className={`outcome-pill ${(sellModal.position.outcome || '').toLowerCase()}`}>
                                        {sellModal.position.outcome}
                                    </span>
                                    <h4>{sellModal.position.title || sellModal.position.question}</h4>
                                </div>

                                <div className="sell-position-stats">
                                    <div className="sell-stat">
                                        <span className="sell-stat-label">Available</span>
                                        <span className="sell-stat-value">
                                            {(typeof sellModal.position.size === 'string'
                                                ? parseFloat(sellModal.position.size)
                                                : sellModal.position.size).toFixed(2)} shares
                                        </span>
                                    </div>
                                    <div className="sell-stat">
                                        <span className="sell-stat-label">Current Price</span>
                                        <span className="sell-stat-value">
                                            {formatPrice(sellModal.position.curPrice || sellModal.position.currentPrice || 0)}
                                        </span>
                                    </div>
                                </div>

                                <div className="sell-form">
                                    {/* Order Type Toggle */}
                                    <div className="order-type-toggle">
                                        <button
                                            className={`order-type-btn ${sellOrderType === 'market' ? 'active' : ''}`}
                                            onClick={() => setSellOrderType('market')}
                                        >
                                            Market
                                        </button>
                                        <button
                                            className={`order-type-btn ${sellOrderType === 'limit' ? 'active' : ''}`}
                                            onClick={() => setSellOrderType('limit')}
                                        >
                                            Limit
                                        </button>
                                    </div>

                                    <div className="sell-input-group">
                                        <label>Amount to Sell</label>
                                        <div className="sell-input-wrapper">
                                            <input
                                                type="number"
                                                value={sellAmount}
                                                onChange={(e) => setSellAmount(e.target.value)}
                                                placeholder="0.00"
                                                step="0.01"
                                                min="0"
                                                max={typeof sellModal.position.size === 'string'
                                                    ? sellModal.position.size
                                                    : sellModal.position.size.toString()}
                                            />
                                            <button
                                                className="max-btn"
                                                onClick={() => setSellAmount(
                                                    (typeof sellModal.position!.size === 'string'
                                                        ? parseFloat(sellModal.position!.size)
                                                        : sellModal.position!.size).toFixed(2)
                                                )}
                                            >
                                                MAX
                                            </button>
                                        </div>
                                    </div>

                                    {/* Limit Price Input - only shown for limit orders */}
                                    {sellOrderType === 'limit' && (
                                        <div className="sell-input-group">
                                            <label>Limit Price (1¢ - 99¢)</label>
                                            <div className="sell-input-wrapper">
                                                <input
                                                    type="number"
                                                    value={sellPriceCents}
                                                    onChange={(e) => setSellPriceCents(e.target.value)}
                                                    placeholder={Math.round((parseFloat(String(sellModal.position.curPrice || sellModal.position.currentPrice || 0.5))) * 100).toString()}
                                                    step="1"
                                                    min="1"
                                                    max="99"
                                                />
                                                <span className="input-suffix">¢</span>
                                            </div>
                                        </div>
                                    )}

                                    <div className="sell-summary">
                                        <div className="sell-summary-row">
                                            <span>{sellOrderType === 'market' ? 'Est. Proceeds' : 'Proceeds (if filled)'}</span>
                                            <span className="sell-proceeds">
                                                ${(parseFloat(sellAmount || '0') * (
                                                    sellOrderType === 'market'
                                                        ? parseFloat(String(sellModal.position.curPrice || sellModal.position.currentPrice || 0))
                                                        : (parseFloat(sellPriceCents || '0') / 100)
                                                )).toFixed(2)}
                                            </span>
                                        </div>
                                        {sellOrderType === 'limit' && parseFloat(sellPriceCents || '0') > 0 && (
                                            <div className="sell-summary-row hint">
                                                <span>Order will fill when price reaches {sellPriceCents}¢</span>
                                            </div>
                                        )}
                                    </div>

                                    {sellError && <div className="sell-error">{sellError}</div>}
                                    {sellSuccess && <div className="sell-success">{sellSuccess}</div>}

                                    <button
                                        className="sell-submit-btn"
                                        onClick={handleSellSubmit}
                                        disabled={isSelling || !sellAmount || (sellOrderType === 'limit' && !sellPriceCents)}
                                    >
                                        {isSelling
                                            ? 'Placing Order...'
                                            : sellOrderType === 'market'
                                                ? 'Market Sell'
                                                : `Limit Sell @ ${sellPriceCents || '—'}¢`
                                        }
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // Orders Tab - Combined open orders + trade history
    return (
        <div className="tab-content">
            <div className="content-header">
                <span className="content-count">
                    {orders.length} open · {trades.length} executed
                </span>
                <button className="refresh-btn-small" onClick={fetchAll} title="Refresh">↻</button>
            </div>

            {error && <div className="content-error">{error}</div>}

            {orders.length === 0 && trades.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-icon">���</div>
                    <h3>No Orders</h3>
                    <p>Your open and executed orders will appear here</p>
                </div>
            ) : (
                <div className="orders-list">
                    {/* Open Orders Section */}
                    {orders.length > 0 && (
                        <div className="orders-section">
                            <div className="section-header">
                                <span className="section-title">Open Orders</span>
                            </div>
                            {orders.map((order) => (
                                <div key={order.id} className="order-row">
                                    <div className={`side-indicator ${order.side.toLowerCase()}`} />
                                    <div className="order-info">
                                        <div className="order-primary">
                                            <span className={`side-badge ${order.side.toLowerCase()}`}>{order.side}</span>
                                            <span className="order-price">{formatPrice(order.price)}</span>
                                            <span className="order-size">{formatSize(order)} shares</span>
                                        </div>
                                        <div className="order-secondary">
                                            <span className="order-time">{formatTime(order.created_at || order.createdAt)}</span>
                                            <span className="order-status open">Open</span>
                                        </div>
                                    </div>
                                    <button
                                        className="cancel-order-btn"
                                        onClick={() => handleCancelOrder(order.id)}
                                        disabled={cancellingId === order.id}
                                    >
                                        {cancellingId === order.id ? '...' : '✕'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Executed Trades Section */}
                    {trades.length > 0 && (
                        <div className="orders-section">
                            <div className="section-header">
                                <span className="section-title">Trade History</span>
                            </div>
                            {trades.map((trade, index) => {
                                // Determine if we were the maker or taker
                                const isMaker = trade.trader_side === 'MAKER';

                                let side: string;
                                let size: number;
                                let price: number;
                                let outcome: string;

                                if (isMaker && trade.maker_orders && trade.maker_orders.length > 0) {
                                    // Find our order in maker_orders by matching wallet address
                                    const myOrder = userWallet
                                        ? trade.maker_orders.find(mo => mo.maker_address.toLowerCase() === userWallet)
                                        : trade.maker_orders[0];

                                    if (myOrder) {
                                        side = myOrder.side || 'BUY';
                                        size = parseFloat(myOrder.matched_amount || '0');
                                        price = parseFloat(myOrder.price || '0');
                                        outcome = myOrder.outcome || '';
                                    } else {
                                        // Fallback to first maker order
                                        const firstMaker = trade.maker_orders[0];
                                        side = firstMaker.side || 'BUY';
                                        size = parseFloat(firstMaker.matched_amount || '0');
                                        price = parseFloat(firstMaker.price || '0');
                                        outcome = firstMaker.outcome || '';
                                    }
                                } else {
                                    // We were the taker, use top-level fields
                                    side = trade.side || 'BUY';
                                    size = parseFloat(trade.size || '0');
                                    price = parseFloat(trade.price || '0');
                                    outcome = trade.outcome || '';
                                }

                                const totalCost = size * price;

                                return (
                                    <div key={trade.id || index} className="order-row executed">
                                        <div className={`side-indicator ${side.toLowerCase()}`} />
                                        <div className="order-info">
                                            <div className="order-primary">
                                                <span className={`side-badge ${side.toLowerCase()}`}>{side}</span>
                                                <span className={`outcome-mini ${outcome.toLowerCase()}`}>{outcome}</span>
                                                <span className="order-size">{size.toFixed(2)} @ {formatPrice(price)}</span>
                                            </div>
                                            <div className="order-secondary">
                                                <span className="order-total">${totalCost.toFixed(2)}</span>
                                                <span className="order-time">{formatTime(trade.match_time || trade.created_at)}</span>
                                                <span className={`order-status ${trade.status?.toLowerCase() || 'filled'}`}>
                                                    {trade.status === 'CONFIRMED' ? 'Filled' : trade.status || 'Filled'}
                                                </span>
                                            </div>
                                        </div>
                                        {trade.transaction_hash && (
                                            <a
                                                className="tx-link-btn"
                                                href={`https://polygonscan.com/tx/${trade.transaction_hash}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                title="View on Polygonscan"
                                            >
                                                ↗
                                            </a>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
