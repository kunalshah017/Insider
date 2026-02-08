/**
 * SwapModal - Elegant token swap interface for acquiring USDC.e
 * 
 * Features:
 * - Token selection dropdown
 * - Real-time quote fetching
 * - Slippage settings
 * - Swap execution with progress tracking
 * 
 * Uses Uniswap v4 on Polygon for the best rates
 */

import { useState, useEffect, useCallback } from 'react';
import {
    SUPPORTED_SWAP_TOKENS,
    getSwapQuoteViaEthCall,
    getTokenBalanceViaEthCall,
    checkPermit2ApprovalViaEthCall,
    approveTokenForPermit2ViaBridge,
    approveUniversalRouterViaBridge,
    executeSwapViaBridge,
    type SwapQuote,
    type TokenInfo,
    type TokenBalance,
} from '@extension/shared';
import { ethereumBridge } from '../../../ethereum-bridge';

interface SwapModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSwapComplete: (usdcAmount: string) => void;
    requiredAmount?: number;
    walletAddress: string;
}

type SwapStep = 'input' | 'quote' | 'approve-permit2' | 'approve-router' | 'swap' | 'pending' | 'success' | 'error';

// Styles matching the existing TradingCard design - Updated to match Twitter/InlineTradingPanel theme
const styles = {
    overlay: {
        position: 'fixed' as const,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(91, 112, 131, 0.4)', // Twitter-like dim overlay
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
    },
    modal: {
        background: '#000000',
        borderRadius: '16px',
        border: '1px solid #2f3336',
        width: '100%',
        maxWidth: '400px',
        boxShadow: '0 16px 32px rgba(0, 0, 0, 0.5)',
        overflow: 'hidden',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        borderBottom: '1px solid #2f3336',
        background: 'transparent',
    },
    title: {
        fontSize: '15px',
        fontWeight: 700,
        color: '#e7e9ea',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    },
    closeButton: {
        background: 'transparent',
        border: 'none',
        color: '#eff3f4',
        fontSize: '18px',
        cursor: 'pointer',
        padding: '8px',
        borderRadius: '50%',
        transition: 'background 0.2s ease',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '32px',
        height: '32px',
    },
    content: {
        padding: '16px',
    },
    tokenSelector: {
        background: 'transparent',
        border: '1px solid #2f3336',
        borderRadius: '16px',
        padding: '12px',
        marginBottom: '8px',
    },
    label: {
        fontSize: '13px',
        color: '#71767b',
        marginBottom: '8px',
        display: 'block',
    },
    tokenButton: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        padding: '8px 12px',
        background: 'transparent',
        border: '1px solid #2f3336',
        borderRadius: '20px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
    },
    tokenInfo: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    },
    tokenIcon: {
        width: '24px',
        height: '24px',
        borderRadius: '50%',
        background: '#eff3f4', // Placeholder bg
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '12px',
        fontWeight: 700,
        color: '#000',
    },
    tokenSymbol: {
        fontSize: '15px',
        fontWeight: 700,
        color: '#e7e9ea',
    },
    tokenBalance: {
        fontSize: '13px',
        color: '#71767b',
    },
    amountInput: {
        width: '100%',
        background: 'transparent',
        border: 'none',
        fontSize: '32px',
        fontWeight: 700,
        color: '#e7e9ea',
        outline: 'none',
        textAlign: 'right' as const,
        fontFamily: 'inherit',
    },
    maxButton: {
        fontSize: '13px',
        fontWeight: 700,
        color: '#1d9bf0',
        background: 'transparent',
        border: '1px solid rgba(29, 155, 240, 0.3)',
        padding: '4px 8px',
        borderRadius: '12px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
    },
    swapArrow: {
        display: 'flex',
        justifyContent: 'center',
        padding: '4px 0',
        margin: '-12px 0',
        position: 'relative' as const,
        zIndex: 10,
    },
    arrowButton: {
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        background: '#000000',
        border: '1px solid #2f3336',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'default',
        fontSize: '16px',
        color: '#1d9bf0',
    },
    outputToken: {
        background: 'transparent',
        border: '1px solid #2f3336',
        borderRadius: '16px',
        padding: '12px',
        marginBottom: '16px',
        marginTop: '4px',
    },
    quoteInfo: {
        background: 'transparent',
        border: '1px solid #2f3336',
        borderRadius: '12px',
        padding: '12px',
        marginBottom: '16px',
    },
    quoteRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '8px',
        fontSize: '13px',
    },
    quoteLabel: {
        color: '#71767b',
    },
    quoteValue: {
        color: '#e7e9ea',
        fontWeight: 500,
    },
    swapButton: {
        width: '100%',
        padding: '14px',
        background: '#1d9bf0',
        border: 'none',
        borderRadius: '24px',
        color: 'white',
        fontSize: '15px',
        fontWeight: 700,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
    },
    disabledButton: {
        opacity: 0.5,
        cursor: 'not-allowed',
        background: '#2f3336',
    },
    successContainer: {
        textAlign: 'center' as const,
        padding: '32px 0',
    },
    successIcon: {
        width: '64px',
        height: '64px',
        borderRadius: '50%',
        background: 'rgba(0, 186, 124, 0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 16px',
        fontSize: '32px',
        color: '#00ba7c',
    },
    successTitle: {
        fontSize: '20px',
        fontWeight: 700,
        color: '#e7e9ea',
        marginBottom: '8px',
    },
    successAmount: {
        fontSize: '28px',
        fontWeight: 700,
        color: '#e7e9ea',
        marginBottom: '24px',
    },
    dropdown: {
        position: 'absolute' as const,
        top: '100%',
        left: 0,
        right: 0,
        marginTop: '8px',
        background: '#000000',
        border: '1px solid #2f3336',
        borderRadius: '12px',
        overflow: 'hidden',
        zIndex: 100,
        boxShadow: '0 12px 32px rgba(255, 255, 255, 0.1)',
    },
    dropdownItem: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        cursor: 'pointer',
        transition: 'background 0.2s ease',
        borderBottom: '1px solid #2f3336',
    },
    stepIndicator: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '24px',
    },
    stepDot: {
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: '#2f3336',
        transition: 'all 0.3s ease',
    },
    stepDotActive: {
        background: '#1d9bf0',
        boxShadow: '0 0 8px rgba(29, 155, 240, 0.4)',
    },
    stepDotComplete: {
        background: '#00ba7c',
    },
    errorContainer: {
        background: 'rgba(249, 24, 128, 0.1)',
        border: '1px solid rgba(249, 24, 128, 0.3)',
        borderRadius: '12px',
        padding: '12px',
        marginBottom: '16px',
    },
    errorText: {
        color: '#f91880',
        fontSize: '13px',
    },
    spinner: {
        width: '18px',
        height: '18px',
        border: '2px solid rgba(255, 255, 255, 0.3)',
        borderTopColor: 'white',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
    },
};

// Token icon URLs from CoinGecko (reliable CDN)
const TOKEN_ICON_URLS: Record<string, string> = {
    WPOL: 'https://assets.coingecko.com/coins/images/4713/standard/polygon.png',
    WETH: 'https://assets.coingecko.com/coins/images/2518/standard/weth.png',
    USDC: 'https://assets.coingecko.com/coins/images/6319/standard/usdc.png',
    'USDC.e': 'https://assets.coingecko.com/coins/images/6319/standard/usdc.png',
    DAI: 'https://assets.coingecko.com/coins/images/9956/standard/Badge_Dai.png',
    USDT: 'https://assets.coingecko.com/coins/images/325/standard/Tether.png',
};

// Fallback text symbols if images fail to load
const TOKEN_ICONS_FALLBACK: Record<string, string> = {
    WPOL: '◈',
    WETH: 'Ξ',
    USDC: '$',
    'USDC.e': '$',
    DAI: '◇',
    USDT: '$',
};

// Token Icon component with image and fallback
function TokenIcon({ symbol, size = 24 }: { symbol: string; size?: number }) {
    const [imageError, setImageError] = useState(false);
    const iconUrl = TOKEN_ICON_URLS[symbol];
    const fallbackSymbol = TOKEN_ICONS_FALLBACK[symbol] || symbol[0];

    const iconStyle = {
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        background: '#eff3f4',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: `${size * 0.5}px`,
        fontWeight: 700 as const,
        color: '#000',
        overflow: 'hidden' as const,
        border: '1px solid #2f3336',
    };

    if (iconUrl && !imageError) {
        return (
            <div style={iconStyle}>
                <img
                    src={iconUrl}
                    alt={symbol}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={() => setImageError(true)}
                />
            </div>
        );
    }

    return <div style={iconStyle}>{fallbackSymbol}</div>;
}

export function SwapModal({
    isOpen,
    onClose,
    onSwapComplete,
    requiredAmount = 0,
    walletAddress,
}: SwapModalProps) {
    const [step, setStep] = useState<SwapStep>('input');
    const [selectedToken, setSelectedToken] = useState<TokenInfo>(SUPPORTED_SWAP_TOKENS[0]);
    const [amount, setAmount] = useState('');
    const [quote, setQuote] = useState<SwapQuote | null>(null);
    const [balances, setBalances] = useState<Map<string, TokenBalance>>(new Map());
    const [isLoadingQuote, setIsLoadingQuote] = useState(false);
    const [isExecuting, setIsExecuting] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [txHash, setTxHash] = useState<string | null>(null);
    const [slippage, setSlippage] = useState(0.5); // 0.5%
    const [isLoadingBalances, setIsLoadingBalances] = useState(false);
    const [hasAutoSelected, setHasAutoSelected] = useState(false);
    const [txStatus, setTxStatus] = useState<'pending' | 'success' | 'failed' | null>(null);
    const [swapOutputAmount, setSwapOutputAmount] = useState<string | null>(null);

    // Create ethCall function using the bridge
    const ethCall = useCallback(async (to: string, data: string): Promise<string> => {
        return await ethereumBridge.ethCall(to, data);
    }, []);

    // Load token balances using ethereumBridge (works in content scripts)
    useEffect(() => {
        if (!isOpen || !walletAddress) {
            console.log('[SwapModal] Balance load skipped:', { isOpen, walletAddress });
            return;
        }

        const loadBalances = async () => {
            console.log('[SwapModal] Loading balances for:', walletAddress);
            setIsLoadingBalances(true);

            try {
                const newBalances = new Map<string, TokenBalance>();

                for (const token of SUPPORTED_SWAP_TOKENS) {
                    try {
                        console.log(`[SwapModal] Fetching balance for ${token.symbol}...`);
                        const balance = await getTokenBalanceViaEthCall(ethCall, token, walletAddress);
                        console.log(`[SwapModal] ${token.symbol} balance:`, balance.balanceFormatted);
                        newBalances.set(token.symbol, balance);
                    } catch (err) {
                        console.error(`[SwapModal] Failed to get ${token.symbol} balance:`, err);
                        // Set zero balance on error
                        newBalances.set(token.symbol, {
                            token,
                            balance: '0',
                            balanceFormatted: '0',
                        });
                    }
                }

                setBalances(newBalances);
                console.log('[SwapModal] Balances loaded:', newBalances.size, 'tokens');

                // Auto-select the token with highest balance (only once)
                if (!hasAutoSelected) {
                    let highestBalance = 0;
                    let highestBalanceToken: TokenInfo | null = null;

                    for (const [symbol, tokenBalance] of newBalances) {
                        const balanceNum = parseFloat(tokenBalance.balanceFormatted) || 0;
                        // Convert to USD value for fair comparison (approximate)
                        let usdValue = balanceNum;
                        if (symbol === 'WPOL') {
                            usdValue = balanceNum * 0.5; // Approximate POL price
                        } else if (symbol === 'WETH') {
                            usdValue = balanceNum * 2000; // Approximate ETH price
                        }
                        // Stablecoins are already ~$1

                        if (usdValue > highestBalance) {
                            highestBalance = usdValue;
                            highestBalanceToken = tokenBalance.token;
                        }
                    }

                    if (highestBalanceToken && highestBalance > 0) {
                        console.log('[SwapModal] Auto-selecting highest balance token:', highestBalanceToken.symbol);
                        setSelectedToken(highestBalanceToken);
                    }
                    setHasAutoSelected(true);
                }
            } catch (err) {
                console.error('[SwapModal] Error loading balances:', err);
            } finally {
                setIsLoadingBalances(false);
            }
        };

        loadBalances();
    }, [isOpen, walletAddress, ethCall, hasAutoSelected]);

    // Fetch quote when amount changes (using ethCall via bridge)
    const fetchQuote = useCallback(async () => {
        if (!amount || parseFloat(amount) <= 0) {
            setQuote(null);
            return;
        }

        setIsLoadingQuote(true);
        setError(null);

        try {
            console.log('[SwapModal] Fetching quote for', selectedToken.symbol, amount);
            const newQuote = await getSwapQuoteViaEthCall(
                ethCall,
                selectedToken,
                amount,
                slippage / 100
            );
            setQuote(newQuote);

            if (!newQuote) {
                setError('Unable to find a route for this swap');
            }
        } catch (err: any) {
            console.error('[SwapModal] Quote error:', err);
            setError(err.message || 'Failed to get quote');
            setQuote(null);
        } finally {
            setIsLoadingQuote(false);
        }
    }, [ethCall, selectedToken, amount, slippage]);

    // Debounce quote fetching
    useEffect(() => {
        const timer = setTimeout(fetchQuote, 500);
        return () => clearTimeout(timer);
    }, [fetchQuote]);

    // Auto-refresh quote every 15 seconds when we have one (prices can change)
    useEffect(() => {
        if (!quote || !isOpen || isExecuting) return;

        const refreshTimer = setInterval(() => {
            console.log('[SwapModal] Auto-refreshing quote...');
            fetchQuote();
        }, 15000); // Refresh every 15 seconds

        return () => clearInterval(refreshTimer);
    }, [quote, isOpen, isExecuting, fetchQuote]);

    // Reset state when modal closes
    useEffect(() => {
        if (!isOpen) {
            setStep('input');
            setAmount('');
            setQuote(null);
            setError(null);
            setTxHash(null);
            setHasAutoSelected(false); // Reset so auto-select works on next open
            setTxStatus(null);
            setSwapOutputAmount(null);
        }
    }, [isOpen]);

    // Pre-calculate suggested swap amount when requiredAmount is provided
    // This helps users know how much they need to swap
    const suggestedOutputAmount = requiredAmount > 0 ? requiredAmount.toFixed(2) : null;

    const handleMaxClick = () => {
        const balance = balances.get(selectedToken.symbol);
        if (balance) {
            // For WPOL, leave some for gas fees
            const maxAmount = selectedToken.symbol === 'WPOL'
                ? Math.max(0, parseFloat(balance.balanceFormatted) - 0.1)
                : parseFloat(balance.balanceFormatted);
            setAmount(maxAmount.toString());
        }
    };

    const handleSwap = async () => {
        if (!quote) {
            console.log('[SwapModal] No quote available');
            return;
        }

        console.log('[SwapModal] Starting swap process...');
        setIsExecuting(true);
        setError(null);

        // Create sendTransaction function using the bridge
        const sendTransaction = async (tx: { to: string; from: string; data: string; value?: string }): Promise<{ hash: string }> => {
            const { hash } = await ethereumBridge.sendTransaction(tx);
            return { hash };
        };

        try {
            // Step 1: Check and approve Permit2
            setStep('approve-permit2');
            console.log('[SwapModal] Checking Permit2 approval...');
            const permit2Check = await checkPermit2ApprovalViaEthCall(ethCall, selectedToken, walletAddress, amount);

            if (permit2Check.needsApproval) {
                console.log('[SwapModal] Permit2 approval needed, requesting...');
                const approvalResult = await approveTokenForPermit2ViaBridge(sendTransaction, selectedToken, walletAddress, amount);
                if (!approvalResult.success) {
                    throw new Error(approvalResult.error || 'Failed to approve Permit2');
                }
                console.log('[SwapModal] Permit2 approval tx:', approvalResult.txHash);
                // Wait a bit for the transaction to be mined
                await new Promise(resolve => setTimeout(resolve, 3000));
            } else {
                console.log('[SwapModal] Permit2 already approved');
            }

            // Step 2: Approve Universal Router on Permit2
            setStep('approve-router');
            console.log('[SwapModal] Approving Universal Router on Permit2...');
            const routerApproval = await approveUniversalRouterViaBridge(sendTransaction, selectedToken, amount, walletAddress);
            if (!routerApproval.success) {
                throw new Error(routerApproval.error || 'Failed to approve router');
            }
            console.log('[SwapModal] Router approval tx:', routerApproval.txHash);
            // Wait a bit for the transaction to be mined
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Step 3: Execute swap
            setStep('swap');
            console.log('[SwapModal] Executing swap...');
            const swapResult = await executeSwapViaBridge(sendTransaction, quote, walletAddress);

            if (swapResult.success && swapResult.txHash) {
                console.log('[SwapModal] Swap tx submitted:', swapResult.txHash);
                setTxHash(swapResult.txHash);
                setSwapOutputAmount(swapResult.outputAmount || quote.outputAmountFormatted);
                setStep('pending');
                setTxStatus('pending');
                setIsExecuting(false);

                // Poll for transaction receipt
                pollTransactionStatus(swapResult.txHash, swapResult.outputAmount || quote.outputAmountFormatted);
            } else {
                throw new Error(swapResult.error || 'Swap failed');
            }
        } catch (err: any) {
            console.error('[SwapModal] Error:', err);
            setError(err.message || 'Swap failed');
            setStep('error');
            setTxStatus('failed');
            setIsExecuting(false);
        }
    };

    // Poll transaction status
    const pollTransactionStatus = async (hash: string, outputAmount: string) => {
        console.log('[SwapModal] Polling transaction status for:', hash);
        const maxAttempts = 60; // Poll for up to 2 minutes
        let attempts = 0;

        const poll = async () => {
            attempts++;
            try {
                // Use eth_getTransactionReceipt via the bridge
                const receiptData = await ethereumBridge.ethCall(
                    '0x0000000000000000000000000000000000000000', // dummy address
                    '0x', // dummy data - we'll use a special method
                    hash // pass hash as extra param
                ).catch(() => null);

                // Actually, we need to call eth_getTransactionReceipt directly
                // Let's use fetch to RPC instead
                const response = await fetch('https://polygon-rpc.com', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        method: 'eth_getTransactionReceipt',
                        params: [hash],
                        id: 1,
                    }),
                });

                const result = await response.json();
                const receipt = result.result;

                if (receipt) {
                    // Transaction is mined
                    const success = receipt.status === '0x1';
                    console.log('[SwapModal] Transaction mined, success:', success);

                    if (success) {
                        setTxStatus('success');
                        setStep('success');
                    } else {
                        setTxStatus('failed');
                        setStep('error');
                        setError('Transaction failed on-chain');
                    }
                    return;
                }

                // Not mined yet, continue polling
                if (attempts < maxAttempts) {
                    setTimeout(poll, 2000); // Poll every 2 seconds
                } else {
                    // Timeout - assume pending (user can check manually)
                    console.log('[SwapModal] Polling timeout, transaction may still be pending');
                }
            } catch (err) {
                console.error('[SwapModal] Error polling transaction:', err);
                if (attempts < maxAttempts) {
                    setTimeout(poll, 2000);
                }
            }
        };

        poll();
    };

    // Handle closing modal after success/error
    const handleClose = () => {
        if (txStatus === 'success' && swapOutputAmount) {
            // Notify parent of successful swap before closing
            onSwapComplete(swapOutputAmount);
        }
        onClose();
    };

    const getStepNumber = (): number => {
        switch (step) {
            case 'input': return 0;
            case 'quote': return 1;
            case 'approve-permit2': return 2;
            case 'approve-router': return 3;
            case 'swap': return 4;
            case 'pending': return 4;
            case 'success': return 5;
            default: return 0;
        }
    };

    if (!isOpen) return null;

    const currentBalance = balances.get(selectedToken.symbol);
    const hasInsufficientBalance = currentBalance && parseFloat(amount) > parseFloat(currentBalance.balanceFormatted);

    return (
        <div style={styles.overlay} onClick={(step === 'success' || step === 'error' || step === 'pending') ? undefined : handleClose}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div style={styles.header}>
                    <div style={styles.title}>
                        <span style={{ fontSize: '20px' }}>{step === 'success' ? '✅' : step === 'error' ? '❌' : step === 'pending' ? '⏳' : '🔄'}</span>
                        <div>
                            <span>
                                {step === 'success' ? 'Swap Complete' :
                                    step === 'error' ? 'Swap Failed' :
                                        step === 'pending' ? 'Transaction Pending' :
                                            'Swap to USDC.e'}
                            </span>
                            {step === 'input' && suggestedOutputAmount && (
                                <div style={{ fontSize: '13px', fontWeight: 400, color: '#71767b', marginTop: '2px' }}>
                                    Required: ${suggestedOutputAmount}
                                </div>
                            )}
                        </div>
                    </div>
                    {step !== 'pending' && step !== 'success' && step !== 'error' && (
                        <button
                            style={styles.closeButton}
                            onClick={handleClose}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239, 243, 244, 0.1)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                            ✕
                        </button>
                    )}
                </div>

                {/* Content */}
                <div style={styles.content}>
                    {/* Step Indicator */}
                    {step !== 'input' && step !== 'success' && (
                        <div style={styles.stepIndicator}>
                            {[1, 2, 3, 4].map((s) => (
                                <div
                                    key={s}
                                    style={{
                                        ...styles.stepDot,
                                        ...(getStepNumber() >= s ? styles.stepDotActive : {}),
                                        ...(getStepNumber() > s ? styles.stepDotComplete : {}),
                                    }}
                                />
                            ))}
                            <span style={{ color: '#71767b', fontSize: '12px', marginLeft: '8px' }}>
                                {step === 'approve-permit2' && 'Approving Permit2...'}
                                {step === 'approve-router' && 'Approving Router...'}
                                {step === 'swap' && 'Executing Swap...'}
                            </span>
                        </div>
                    )}

                    {/* Pending State */}
                    {step === 'pending' && (
                        <div style={styles.successContainer}>
                            <div style={{
                                ...styles.successIcon,
                                background: 'rgba(29, 155, 240, 0.1)',
                                color: '#1d9bf0',
                            }}>
                                <div style={{
                                    width: '32px',
                                    height: '32px',
                                    border: '3px solid rgba(29, 155, 240, 0.3)',
                                    borderTopColor: '#1d9bf0',
                                    borderRadius: '50%',
                                    animation: 'spin 1s linear infinite',
                                }} />
                            </div>
                            <div style={{ ...styles.successTitle, color: '#1d9bf0' }}>Processing...</div>
                            <div style={{ fontSize: '14px', color: '#71767b', marginBottom: '16px' }}>
                                Confirming transaction on Polygon usually takes ~5s
                            </div>
                            {txHash && (
                                <a
                                    href={`https://polygonscan.com/tx/${txHash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        color: '#1d9bf0',
                                        fontSize: '14px',
                                        padding: '10px 16px',
                                        background: 'rgba(29, 155, 240, 0.1)',
                                        borderRadius: '20px',
                                        textDecoration: 'none',
                                        fontWeight: 600,
                                    }}
                                >
                                    View on PolygonScan
                                </a>
                            )}
                        </div>
                    )}

                    {/* Success State */}
                    {step === 'success' && (
                        <div style={styles.successContainer}>
                            <div style={styles.successIcon}>✓</div>
                            <div style={styles.successTitle}>Swap Complete!</div>
                            <div style={styles.successAmount}>
                                +{swapOutputAmount || quote?.outputAmountFormatted} USDC.e
                            </div>
                            {txHash && (
                                <a
                                    href={`https://polygonscan.com/tx/${txHash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        color: '#1d9bf0',
                                        fontSize: '14px',
                                        marginBottom: '24px',
                                        textDecoration: 'none',
                                        fontWeight: 500,
                                    }}
                                >
                                    View on PolygonScan ↗
                                </a>
                            )}
                            <button
                                style={{ ...styles.swapButton, background: '#00ba7c' }}
                                onClick={handleClose}
                            >
                                Done
                            </button>
                        </div>
                    )}

                    {/* Error State */}
                    {step === 'error' && (
                        <div style={styles.successContainer}>
                            <div style={{
                                ...styles.successIcon,
                                background: 'rgba(249, 24, 128, 0.1)',
                                color: '#f91880',
                            }}>✗</div>
                            <div style={{ ...styles.successTitle, color: '#f91880' }}>Swap Failed</div>
                            <div style={{ fontSize: '14px', color: '#71767b', marginBottom: '16px' }}>
                                {error || 'Transaction could not be completed'}
                            </div>
                            {txHash && (
                                <a
                                    href={`https://polygonscan.com/tx/${txHash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        color: '#1d9bf0',
                                        fontSize: '14px',
                                        marginBottom: '24px',
                                        textDecoration: 'none',
                                    }}
                                >
                                    View on PolygonScan ↗
                                </a>
                            )}
                            <button
                                style={{ ...styles.swapButton, background: '#2f3336' }}
                                onClick={handleClose}
                            >
                                Close
                            </button>
                        </div>
                    )}

                    {step !== 'success' && step !== 'error' && step !== 'pending' && (
                        <>
                            {/* From Token */}
                            <div style={styles.tokenSelector}>
                                <span style={styles.label}>You pay</span>
                                <div style={{ position: 'relative' }}>
                                    <div
                                        style={styles.tokenButton}
                                        onClick={() => setShowDropdown(!showDropdown)}
                                        onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#1d9bf0')}
                                        onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#2f3336')}
                                    >
                                        <div style={styles.tokenInfo}>
                                            <TokenIcon symbol={selectedToken.symbol} size={28} />
                                            <div>
                                                <div style={styles.tokenSymbol}>{selectedToken.symbol}</div>
                                                <div style={styles.tokenBalance}>
                                                    Balance: {isLoadingBalances ? '...' : (currentBalance?.balanceFormatted
                                                        ? parseFloat(currentBalance.balanceFormatted).toFixed(4)
                                                        : '0.00')}
                                                </div>
                                            </div>
                                        </div>
                                        <span style={{ color: '#71767b' }}>▼</span>
                                    </div>

                                    {/* Dropdown */}
                                    {showDropdown && (
                                        <div style={styles.dropdown}>
                                            {SUPPORTED_SWAP_TOKENS.map((token) => (
                                                <div
                                                    key={token.symbol}
                                                    style={styles.dropdownItem}
                                                    onClick={() => {
                                                        setSelectedToken(token);
                                                        setShowDropdown(false);
                                                    }}
                                                    onMouseEnter={(e) => (e.currentTarget.style.background = '#16181c')}
                                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                                >
                                                    <div style={styles.tokenInfo}>
                                                        <TokenIcon symbol={token.symbol} size={24} />
                                                        <span style={styles.tokenSymbol}>{token.symbol}</span>
                                                    </div>
                                                    <span style={{ color: '#71767b', fontSize: '13px' }}>
                                                        {isLoadingBalances ? '...' : (balances.get(token.symbol)?.balanceFormatted
                                                            ? parseFloat(balances.get(token.symbol)!.balanceFormatted).toFixed(4)
                                                            : '0.00')}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Amount Input */}
                                <div style={{ display: 'flex', alignItems: 'center', marginTop: '12px', gap: '8px' }}>
                                    <input
                                        type="number"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        placeholder="0.00"
                                        style={styles.amountInput}
                                        disabled={isExecuting}
                                    />
                                    <button
                                        style={styles.maxButton}
                                        onClick={handleMaxClick}
                                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(29, 155, 240, 0.1)')}
                                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                    >
                                        MAX
                                    </button>
                                </div>
                            </div>

                            {/* Swap Arrow */}
                            <div style={styles.swapArrow}>
                                <div style={styles.arrowButton}>↓</div>
                            </div>

                            {/* Required Amount Info */}
                            {suggestedOutputAmount && (
                                <div style={{
                                    background: 'rgba(29, 155, 240, 0.1)',
                                    border: '1px solid rgba(29, 155, 240, 0.3)',
                                    borderRadius: '16px',
                                    padding: '12px',
                                    marginBottom: '12px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                }}>
                                    <div>
                                        <div style={{ fontSize: '13px', color: '#1d9bf0', fontWeight: 500 }}>
                                            Required Amount
                                        </div>
                                        <div style={{ fontSize: '15px', fontWeight: 700, color: '#e7e9ea' }}>
                                            ${suggestedOutputAmount} USDC.e
                                        </div>
                                    </div>
                                    {quote && (
                                        <div style={{ textAlign: 'right' }}>
                                            {parseFloat(quote.outputAmountFormatted) >= requiredAmount ? (
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    color: '#00ba7c',
                                                    fontSize: '13px',
                                                    fontWeight: 600,
                                                }}>
                                                    <span>✓</span>
                                                    <span>Sufficient</span>
                                                </div>
                                            ) : (
                                                <div style={{
                                                    color: '#f91880',
                                                    fontSize: '12px',
                                                    fontWeight: 500,
                                                }}>
                                                    Need ${(requiredAmount - parseFloat(quote.outputAmountFormatted)).toFixed(2)} more
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* To Token (USDC.e) */}
                            <div style={styles.outputToken}>
                                <span style={styles.label}>You receive</span>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={styles.tokenInfo}>
                                        <TokenIcon symbol="USDC.e" size={28} />
                                        <div>
                                            <div style={styles.tokenSymbol}>USDC.e</div>
                                            <div style={styles.tokenBalance}>Bridged USDC</div>
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        {isLoadingQuote ? (
                                            <div style={{ color: '#71767b', fontSize: '16px' }}>Loading...</div>
                                        ) : (
                                            <div style={{ fontSize: '24px', fontWeight: 600, color: '#00ba7c' }}>
                                                {quote ? parseFloat(quote.outputAmountFormatted).toFixed(2) : '0.00'}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Quote Details */}
                            {quote && (
                                <div style={styles.quoteInfo}>
                                    <div style={styles.quoteRow}>
                                        <span style={styles.quoteLabel}>Rate</span>
                                        <span style={styles.quoteValue}>
                                            1 {selectedToken.symbol} = {quote.exchangeRate.toFixed(4)} USDC.e
                                        </span>
                                    </div>
                                    <div style={styles.quoteRow}>
                                        <span style={styles.quoteLabel}>Route</span>
                                        <span style={styles.quoteValue}>{quote.route}</span>
                                    </div>
                                    <div style={styles.quoteRow}>
                                        <span style={styles.quoteLabel}>Minimum received</span>
                                        <span style={styles.quoteValue}>
                                            {parseFloat(quote.minimumReceived).toFixed(2)} USDC.e
                                        </span>
                                    </div>
                                    <div style={{ ...styles.quoteRow, marginBottom: 0 }}>
                                        <span style={styles.quoteLabel}>Slippage tolerance</span>
                                        <span style={styles.quoteValue}>{slippage}%</span>
                                    </div>
                                </div>
                            )}

                            {/* Error Message */}
                            {error && (
                                <div style={styles.errorContainer}>
                                    <div style={styles.errorText}>⚠️ {error}</div>
                                </div>
                            )}

                            {/* Insufficient Balance Warning */}
                            {hasInsufficientBalance && (
                                <div style={{ ...styles.errorContainer, background: 'rgba(255, 212, 0, 0.1)', borderColor: 'rgba(255, 212, 0, 0.3)' }}>
                                    <div style={{ ...styles.errorText, color: '#ffd400' }}>
                                        Insufficient {selectedToken.symbol} balance
                                    </div>
                                </div>
                            )}

                            {/* Swap Button */}
                            <button
                                style={{
                                    ...styles.swapButton,
                                    ...((!quote || hasInsufficientBalance || isExecuting) ? styles.disabledButton : {}),
                                }}
                                onClick={handleSwap}
                                disabled={!quote || hasInsufficientBalance || isExecuting}
                            >
                                {isExecuting ? (
                                    <>
                                        <div style={styles.spinner} />
                                        {step === 'approve-permit2' && 'Approving Permit2...'}
                                        {step === 'approve-router' && 'Approving Router...'}
                                        {step === 'swap' && 'Swapping...'}
                                    </>
                                ) : !amount || parseFloat(amount) <= 0 ? (
                                    'Enter amount'
                                ) : !quote ? (
                                    'Loading quote...'
                                ) : hasInsufficientBalance ? (
                                    `Insufficient ${selectedToken.symbol}`
                                ) : (
                                    `Swap for ${parseFloat(quote.outputAmountFormatted).toFixed(2)} USDC.e`
                                )}
                            </button>

                            {/* Powered by Uniswap */}
                            <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '11px', color: '#71767b' }}>
                                Powered by <span style={{ color: '#ff007a' }}>Uniswap v4</span> on Polygon
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Spinner animation */}
            <style>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}

export default SwapModal;
