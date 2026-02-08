import { useEffect, useRef, useCallback } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { TradingCard } from './components/TradingCard';
import { parsePolymarketUrl, type ParsedPolymarketUrl } from '@extension/shared';
import { ethereumBridge } from '../../ethereum-bridge';
import {
    buildOrderData,
    buildOrderTypedData,
    type SignedOrder,
    type UserOrder,
    SignatureType,
} from '../../utils/order-builder';
import { safeSendMessage, isExtensionContextValid } from '../../utils/chrome-messaging';

// Contract addresses for CTF approval
const CTF_CONTRACT_ADDRESS = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';
const CTF_EXCHANGE_ADDRESS = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
const NEG_RISK_CTF_EXCHANGE_ADDRESS = '0xC5d563A36AE78145C45a50134d48A1215220f80a';
const USDC_E_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

// ERC-1155 function selectors
const IS_APPROVED_FOR_ALL_SELECTOR = '0xe985e9c5'; // isApprovedForAll(address,address)
const SET_APPROVAL_FOR_ALL_SELECTOR = '0xa22cb465'; // setApprovalForAll(address,bool)
// CTF redeem function selector - keccak256("redeemPositions(address,bytes32,bytes32,uint256[])")[0:4]
const REDEEM_POSITIONS_SELECTOR = '0x54ad71c2'; // redeemPositions(address,bytes32,bytes32,uint256[])

/**
 * Encode address for contract call (pad to 32 bytes)
 */
function encodeAddress(address: string): string {
    return address.toLowerCase().replace('0x', '').padStart(64, '0');
}

/**
 * Encode boolean for contract call
 */
function encodeBool(value: boolean): string {
    return value ? '1'.padStart(64, '0') : '0'.padStart(64, '0');
}

/**
 * Check if CTF Exchange is approved to transfer user's conditional tokens
 */
async function checkCTFApproval(owner: string, negRisk: boolean): Promise<boolean> {
    const operator = negRisk ? NEG_RISK_CTF_EXCHANGE_ADDRESS : CTF_EXCHANGE_ADDRESS;
    const data = IS_APPROVED_FOR_ALL_SELECTOR + encodeAddress(owner) + encodeAddress(operator);

    try {
        const result = await ethereumBridge.ethCall(CTF_CONTRACT_ADDRESS, data);
        // Result is 0x0...1 if approved, 0x0...0 if not
        return BigInt(result) === BigInt(1);
    } catch (error) {
        console.error('[Insider] Error checking CTF approval:', error);
        return false;
    }
}

/**
 * Request approval for CTF Exchange to transfer conditional tokens
 */
async function requestCTFApproval(owner: string, negRisk: boolean): Promise<boolean> {
    const operator = negRisk ? NEG_RISK_CTF_EXCHANGE_ADDRESS : CTF_EXCHANGE_ADDRESS;
    const data = SET_APPROVAL_FOR_ALL_SELECTOR + encodeAddress(operator) + encodeBool(true);

    try {
        console.log('[Insider] Requesting CTF approval for', negRisk ? 'Neg Risk Exchange' : 'CTF Exchange');
        const result = await ethereumBridge.sendTransaction({
            from: owner,
            to: CTF_CONTRACT_ADDRESS,
            data: '0x' + data.replace(/^0x/, ''),
            value: '0x0',
        });
        console.log('[Insider] CTF approval transaction sent:', result.hash);

        // Wait a bit for the transaction to be mined
        // In production you'd want to actually wait for confirmation
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Verify approval was successful
        const isApproved = await checkCTFApproval(owner, negRisk);
        if (!isApproved) {
            console.warn('[Insider] Approval transaction sent but not yet confirmed. Proceeding anyway...');
        }

        return true;
    } catch (error) {
        console.error('[Insider] Error requesting CTF approval:', error);
        return false;
    }
}

/**
 * Encode bytes32 for contract call (conditionId format)
 */
function encodeBytes32(value: string): string {
    // Remove 0x prefix and ensure 64 chars (32 bytes)
    return value.replace('0x', '').padStart(64, '0');
}

/**
 * Encode uint256 array for contract call
 * For redeemPositions, indexSets = [1, 2] to redeem both YES (1) and NO (2)
 */
function encodeIndexSetsArray(): string {
    // ABI encoding for dynamic array:
    // - offset to start of array data (0x80 = 128, which points past the 4 fixed params)
    // - length of array (2)
    // - array elements (1, 2)
    const offset = '0000000000000000000000000000000000000000000000000000000000000080'; // offset to array data
    const length = '0000000000000000000000000000000000000000000000000000000000000002'; // array length = 2
    const elem1 = '0000000000000000000000000000000000000000000000000000000000000001'; // value 1 (YES)
    const elem2 = '0000000000000000000000000000000000000000000000000000000000000002'; // value 2 (NO)
    return offset + length + elem1 + elem2;
}

/**
 * Handle redeem position requests from the popup (via background script)
 */
async function handleRedeemPosition(
    conditionId: string,
    negRisk: boolean,
    walletAddress: string
): Promise<{ data?: any; error?: string }> {
    try {
        console.log('[Insider] Redeeming position for conditionId:', conditionId);

        // For redeeming, we don't need exchange approval, just call CTF directly
        // The CTF contract transfers USDCe to the user for winning positions

        // Build the redeemPositions call data
        // redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets)
        const parentCollectionId = '0'.repeat(64); // HashZero for Polymarket
        
        // For dynamic array, we need: fixed params + array offset + array data
        // Fixed params: collateralToken, parentCollectionId, conditionId
        // Then offset pointing to array data, then array length + elements
        const data = REDEEM_POSITIONS_SELECTOR +
            encodeAddress(USDC_E_ADDRESS) +           // collateralToken (USDCe)
            parentCollectionId +                       // parentCollectionId (HashZero)
            encodeBytes32(conditionId) +              // conditionId
            encodeIndexSetsArray();                   // indexSets [1, 2]

        console.log('[Insider] Redeem call data:', data);

        // Send the transaction
        const result = await ethereumBridge.sendTransaction({
            from: walletAddress,
            to: CTF_CONTRACT_ADDRESS,
            data: '0x' + data.replace(/^0x/, ''),
            value: '0x0',
        });

        console.log('[Insider] Redeem transaction sent:', result.hash);

        return {
            data: {
                transactionHash: result.hash,
                message: 'Redemption transaction submitted successfully!',
            },
        };
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to redeem position';
        console.error('[Insider] Redeem position error:', err);
        return { error: errorMessage };
    }
}

// Store roots to clean up later
const cardRoots = new Map<HTMLElement, Root>();

/**
 * Handle sell order signing requests from the popup (via background script)
 */
async function handleSellOrderSigning(
    tokenId: string,
    size: number,
    price: number,
    negRisk: boolean,
    walletAddress: string,
    session: { apiKey: string; apiSecret: string; passphrase: string }
): Promise<{ data?: any; error?: string }> {
    try {
        console.log('[Insider] Signing sell order from popup request...');

        // Step 0: Check and request CTF approval if needed
        console.log('[Insider] Checking CTF approval for selling...');
        const isApproved = await checkCTFApproval(walletAddress, negRisk);

        if (!isApproved) {
            console.log('[Insider] CTF Exchange not approved. Requesting approval...');
            const approvalSuccess = await requestCTFApproval(walletAddress, negRisk);

            if (!approvalSuccess) {
                return { error: 'Failed to approve CTF Exchange. Please approve in MetaMask and try again.' };
            }

            console.log('[Insider] CTF approval granted. Proceeding with sell order...');
        } else {
            console.log('[Insider] CTF Exchange already approved.');
        }

        // Step 1: Build order data structure
        const userOrder: UserOrder = {
            tokenId,
            side: 'SELL',
            price,
            size,
            feeRateBps: 1000, // Polymarket taker fee: 10% (1000 bps)
            nonce: 0,
        };

        const orderData = buildOrderData(
            userOrder,
            walletAddress, // maker
            walletAddress, // signer (same for EOA)
            '0.01', // tickSize
            SignatureType.EOA,
        );

        console.log('[Insider] Sell order data built:', {
            tokenId: orderData.tokenId,
            side: orderData.side,
            makerAmount: orderData.makerAmount,
            takerAmount: orderData.takerAmount,
        });

        // Step 2: Build EIP-712 typed data for signing
        const typedData = buildOrderTypedData(orderData, negRisk);

        // Step 3: Sign with MetaMask
        console.log('[Insider] Requesting sell order signature from MetaMask...');
        const { signature } = await ethereumBridge.signTypedData(walletAddress, typedData);
        console.log('[Insider] Sell order signed successfully');

        // Step 4: Create signed order object
        const signedOrder: SignedOrder = {
            ...orderData,
            signature,
        };

        // Step 5: Submit via background script
        console.log('[Insider] Submitting signed sell order to background...');
        const response = await safeSendMessage<{ success: boolean }>({
            type: 'SUBMIT_SIGNED_ORDER',
            signedOrder,
            credentials: {
                address: walletAddress,
                apiKey: session.apiKey,
                apiSecret: session.apiSecret,
                passphrase: session.passphrase,
            },
            negRisk,
        });

        if (response.error) {
            return { error: response.error };
        }

        console.log('[Insider] Sell order submitted successfully!', response.data);
        return { data: response.data };
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to sign sell order';
        console.error('[Insider] Sell order signing error:', err);
        return { error: errorMessage };
    }
}

/**
 * Check if an element contains a Polymarket link
 */
function findPolymarketLinks(element: Element): Array<{ anchor: HTMLAnchorElement; parsed: ParsedPolymarketUrl }> {
    const links: Array<{ anchor: HTMLAnchorElement; parsed: ParsedPolymarketUrl }> = [];

    // Find all anchor tags
    const anchors = element.querySelectorAll('a[href]');

    anchors.forEach((anchor) => {
        if (!(anchor instanceof HTMLAnchorElement)) return;

        // Check if this anchor or its text content mentions polymarket
        const href = anchor.href;
        const text = anchor.textContent || '';

        // X/Twitter uses t.co redirects, but the visible text shows the actual URL
        // Check if the visible text contains polymarket.com
        if (text.includes('polymarket.com')) {
            const parsed = parsePolymarketUrl(text);
            if (parsed) {
                links.push({ anchor, parsed });
            }
        }
        // Also check href in case it's a direct link
        else if (href.includes('polymarket.com')) {
            const parsed = parsePolymarketUrl(href);
            if (parsed) {
                links.push({ anchor, parsed });
            }
        }
    });

    return links;
}

/**
 * Find Twitter card previews that contain Polymarket links (via t.co redirects)
 * These cards have data-testid="card.wrapper" and contain preview images
 */
function findPolymarketCardPreviews(element: Element): Array<{ card: Element; parsed: ParsedPolymarketUrl | null; tcoLink?: string }> {
    const cards: Array<{ card: Element; parsed: ParsedPolymarketUrl | null; tcoLink?: string }> = [];

    // Find all Twitter card wrappers
    const cardWrappers = element.querySelectorAll('[data-testid="card.wrapper"]');

    cardWrappers.forEach((card) => {
        // Check if already processed
        if ((card as HTMLElement).dataset.insiderProcessed === 'true') {
            return;
        }

        // Find the link inside the card
        const link = card.querySelector('a[href]');
        if (!link || !(link instanceof HTMLAnchorElement)) return;

        const href = link.href;
        const ariaLabel = (link.getAttribute('aria-label') || '').toLowerCase().trim();

        // Also check for "From polymarket.com" text which appears below the card image
        const cardParent = card.parentElement;
        const fromText = cardParent?.textContent?.toLowerCase() || '';

        // Check if this card is related to polymarket
        const isPolymarketCard = ariaLabel.includes('polymarket') ||
            fromText.includes('from polymarket') ||
            fromText.includes('polymarket.com');

        if (!isPolymarketCard) return;

        console.log('[Insider] Found Polymarket card preview:', { ariaLabel, href });

        // Try to extract event slug from various sources
        const fullText = (card.textContent || '') + ' ' + (cardParent?.textContent || '');
        const eventMatch = fullText.match(/polymarket\.com\/event\/([a-zA-Z0-9-]+)/i);

        if (eventMatch) {
            const parsed = parsePolymarketUrl(`https://polymarket.com/event/${eventMatch[1]}`);
            if (parsed) {
                cards.push({ card, parsed });
                return;
            }
        }

        // Check if href is a direct polymarket link
        if (href.includes('polymarket.com')) {
            const parsed = parsePolymarketUrl(href);
            if (parsed) {
                cards.push({ card, parsed });
                return;
            }
        }

        // If we have a t.co link, we'll need to resolve it
        if (href.includes('t.co/') || href.includes('t.co\\')) {
            cards.push({ card, parsed: null, tcoLink: href });
        }
    });

    return cards;
}

/**
 * Also scan the page directly for card wrappers (not just within tweets)
 */
function findStandaloneCardPreviews(): Array<{ card: Element; parsed: ParsedPolymarketUrl | null; tcoLink?: string }> {
    const cards: Array<{ card: Element; parsed: ParsedPolymarketUrl | null; tcoLink?: string }> = [];

    // Find all Twitter card wrappers on the page
    const cardWrappers = document.querySelectorAll('[data-testid="card.wrapper"]');

    cardWrappers.forEach((card) => {
        // Check if already processed or currently being processed
        if ((card as HTMLElement).dataset.insiderProcessed === 'true' ||
            (card as HTMLElement).dataset.insiderProcessing === 'true') {
            return;
        }

        // Find the link inside the card
        const link = card.querySelector('a[href]');
        if (!link || !(link instanceof HTMLAnchorElement)) return;

        const href = link.href;
        const ariaLabel = (link.getAttribute('aria-label') || '').toLowerCase().trim();

        // Check parent and sibling elements for "From polymarket.com" text
        const cardParent = card.parentElement;
        const grandParent = cardParent?.parentElement;
        const siblingText = cardParent?.nextElementSibling?.textContent?.toLowerCase() || '';
        const prevSiblingText = cardParent?.previousElementSibling?.textContent?.toLowerCase() || '';
        const parentText = grandParent?.textContent?.toLowerCase() || '';

        // Check if this card is related to polymarket
        const isPolymarketCard = ariaLabel.includes('polymarket') ||
            siblingText.includes('polymarket') ||
            prevSiblingText.includes('polymarket') ||
            parentText.includes('from polymarket');

        if (!isPolymarketCard) return;

        console.log('[Insider] Found standalone Polymarket card preview:', { ariaLabel, href });

        // Try to extract event slug
        const fullText = parentText;
        const eventMatch = fullText.match(/polymarket\.com\/event\/([a-zA-Z0-9-]+)/i);

        if (eventMatch) {
            const parsed = parsePolymarketUrl(`https://polymarket.com/event/${eventMatch[1]}`);
            if (parsed) {
                cards.push({ card, parsed });
                return;
            }
        }

        // Check if href is a direct polymarket link
        if (href.includes('polymarket.com')) {
            const parsed = parsePolymarketUrl(href);
            if (parsed) {
                cards.push({ card, parsed });
                return;
            }
        }

        // If we have a t.co link, we'll need to resolve it
        if (href.includes('t.co/') || href.includes('t.co\\')) {
            cards.push({ card, parsed: null, tcoLink: href });
        }
    });

    return cards;
}

/**
 * Resolve a t.co shortened URL to get the actual destination
 * Uses a background script message since content scripts can't follow redirects due to CORS
 */
async function resolveTcoLink(tcoUrl: string): Promise<string | null> {
    // Check if extension context is still valid
    if (!isExtensionContextValid()) {
        console.log('[Insider] Extension context invalidated, cannot resolve t.co link');
        return null;
    }

    try {
        console.log('[Insider] Sending t.co link to background for resolution:', tcoUrl);

        // Ask the background script to resolve the URL
        const response = await safeSendMessage<{ resolvedUrl?: string }>({
            type: 'RESOLVE_TCO_LINK',
            url: tcoUrl
        });

        console.log('[Insider] Background response:', response);

        if (response.data?.resolvedUrl) {
            console.log('[Insider] Resolved t.co link:', tcoUrl, '->', response.data.resolvedUrl);
            return response.data.resolvedUrl;
        }

        if (response.error) {
            console.log('[Insider] Error from background:', response.error);
        }

        return null;
    } catch (err) {
        console.log('[Insider] Failed to resolve t.co link:', err);
        return null;
    }
}

/**
 * Replace a Twitter card preview with our trading card
 */
function replaceCardPreview(cardWrapper: Element, parsed: ParsedPolymarketUrl) {
    // Check if already processed
    if ((cardWrapper as HTMLElement).dataset.insiderProcessed === 'true') {
        return;
    }

    // Mark as processed
    (cardWrapper as HTMLElement).dataset.insiderProcessed = 'true';

    // Create container for our card
    const container = document.createElement('div');
    container.className = 'insider-card-container';
    container.style.cssText = 'margin-top: 12px; width: 100%;';

    // Insert our container after the card wrapper
    cardWrapper.parentElement?.insertBefore(container, cardWrapper.nextSibling);

    // Hide the original Twitter card preview
    (cardWrapper as HTMLElement).style.display = 'none';

    // Create shadow root for style isolation
    const shadow = container.attachShadow({ mode: 'open' });

    // Add styles to shadow DOM
    const styleSheet = document.createElement('style');
    styleSheet.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    .insider-root {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #e7e9ea;
    }
  `;
    shadow.appendChild(styleSheet);

    // Create React root
    const reactContainer = document.createElement('div');
    reactContainer.className = 'insider-root';
    shadow.appendChild(reactContainer);

    const root = createRoot(reactContainer);
    cardRoots.set(container, root);

    root.render(<TradingCard slug={parsed.slug} type={parsed.type} fullUrl={parsed.fullUrl} />);

    console.log(`[Insider] Replaced Twitter card preview with trading card for ${parsed.type}: ${parsed.slug}`);
}

/**
 * Inject a trading card below a Polymarket link
 */
function injectTradingCard(anchor: HTMLAnchorElement, parsed: ParsedPolymarketUrl) {
    // Check if we already injected a card for this link
    if (anchor.dataset.insiderInjected === 'true') {
        return;
    }

    // Mark as injected
    anchor.dataset.insiderInjected = 'true';

    // Find the parent tweet container to inject the card
    const tweetText = anchor.closest('[data-testid="tweetText"]');
    if (!tweetText) {
        console.log('[Insider] Could not find tweet text container');
        return;
    }

    // Create container for our card
    const container = document.createElement('div');
    container.className = 'insider-card-container';
    container.style.cssText = 'margin-top: 12px; width: 100%;';

    // Insert after the tweet text
    tweetText.parentElement?.insertBefore(container, tweetText.nextSibling);

    // Create shadow root for style isolation
    const shadow = container.attachShadow({ mode: 'open' });

    // Add styles to shadow DOM
    const styleSheet = document.createElement('style');
    styleSheet.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    .insider-root {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #e7e9ea;
    }
  `;
    shadow.appendChild(styleSheet);

    // Create React root
    const reactContainer = document.createElement('div');
    reactContainer.className = 'insider-root';
    shadow.appendChild(reactContainer);

    const root = createRoot(reactContainer);
    cardRoots.set(container, root);

    root.render(<TradingCard slug={parsed.slug} type={parsed.type} fullUrl={parsed.fullUrl} />);

    console.log(`[Insider] Injected trading card for ${parsed.type}: ${parsed.slug}`);
}

/**
 * Process a tweet element to find and inject trading cards
 */
async function processTweet(tweet: Element) {
    // Process regular Polymarket links in tweet text
    const links = findPolymarketLinks(tweet);
    links.forEach(({ anchor, parsed }) => {
        injectTradingCard(anchor, parsed);
    });

    // Process Twitter card previews that link to Polymarket
    const cardPreviews = findPolymarketCardPreviews(tweet);

    for (const { card, parsed, tcoLink } of cardPreviews) {
        if (parsed) {
            // We have a parsed URL, inject directly
            replaceCardPreview(card, parsed);
        } else if (tcoLink) {
            // Need to resolve the t.co link first
            const resolvedUrl = await resolveTcoLink(tcoLink);
            if (resolvedUrl && resolvedUrl.includes('polymarket.com')) {
                const resolvedParsed = parsePolymarketUrl(resolvedUrl);
                if (resolvedParsed) {
                    replaceCardPreview(card, resolvedParsed);
                }
            }
        }
    }
}

/**
 * Scan the page for tweets with Polymarket links
 */
async function scanForTweets() {
    // Find all tweet articles
    const tweets = document.querySelectorAll('article[data-testid="tweet"]');

    for (let i = 0; i < tweets.length; i++) {
        await processTweet(tweets[i]);
    }

    // Also scan for standalone card previews that might not be within article elements
    await processStandaloneCardPreviews();
}

/**
 * Process standalone card previews (not within tweet articles)
 */
async function processStandaloneCardPreviews() {
    const cardPreviews = findStandaloneCardPreviews();
    console.log('[Insider] Processing', cardPreviews.length, 'standalone card previews');

    for (const { card, parsed, tcoLink } of cardPreviews) {
        // Mark as processing (not processed) to prevent duplicate async calls
        // Use a different attribute so replaceCardPreview can still mark as fully processed
        if ((card as HTMLElement).dataset.insiderProcessing === 'true') {
            continue;
        }
        (card as HTMLElement).dataset.insiderProcessing = 'true';

        if (parsed) {
            console.log('[Insider] Have parsed URL, replacing card preview');
            replaceCardPreview(card, parsed);
        } else if (tcoLink) {
            console.log('[Insider] Need to resolve t.co link:', tcoLink);
            const resolvedUrl = await resolveTcoLink(tcoLink);
            console.log('[Insider] Resolved URL result:', resolvedUrl);
            if (resolvedUrl && resolvedUrl.includes('polymarket.com')) {
                const resolvedParsed = parsePolymarketUrl(resolvedUrl);
                console.log('[Insider] Parsed resolved URL:', resolvedParsed);
                if (resolvedParsed) {
                    console.log('[Insider] Calling replaceCardPreview with:', resolvedParsed);
                    replaceCardPreview(card, resolvedParsed);
                }
            } else {
                console.log('[Insider] Resolved URL does not contain polymarket.com or is null');
            }
        }
    }
}

export default function App() {
    const observerRef = useRef<MutationObserver | null>(null);

    const handleMutations = useCallback((mutations: MutationRecord[]) => {
        for (const mutation of mutations) {
            // Check added nodes
            mutation.addedNodes.forEach((node) => {
                if (node instanceof Element) {
                    // Check if this is a tweet or contains tweets
                    if (node.matches?.('article[data-testid="tweet"]')) {
                        processTweet(node);
                    } else {
                        const tweets = node.querySelectorAll?.('article[data-testid="tweet"]');
                        tweets?.forEach((tweet) => processTweet(tweet));
                    }

                    // Also check for card wrappers directly (for link previews)
                    if (node.matches?.('[data-testid="card.wrapper"]')) {
                        processStandaloneCardPreviews();
                    } else if (node.querySelectorAll?.('[data-testid="card.wrapper"]')?.length > 0) {
                        processStandaloneCardPreviews();
                    }
                }
            });
        }
    }, []);

    useEffect(() => {
        console.log('[Insider] Twitter content script loaded');

        // Initial scan
        scanForTweets();

        // Set up mutation observer to catch dynamically loaded tweets
        observerRef.current = new MutationObserver(handleMutations);

        observerRef.current.observe(document.body, {
            childList: true,
            subtree: true,
        });

        // Listen for sell order signing requests from popup (via background)
        const messageListener = (
            message: any,
            _sender: chrome.runtime.MessageSender,
            sendResponse: (response: any) => void
        ) => {
            if (message.type === 'SIGN_SELL_ORDER') {
                console.log('[Insider] Received sell order signing request from popup');
                handleSellOrderSigning(
                    message.tokenId,
                    message.size,
                    message.price,
                    message.negRisk,
                    message.walletAddress,
                    message.session
                ).then(sendResponse);
                return true; // Keep channel open for async response
            }
            if (message.type === 'SIGN_REDEEM_POSITION') {
                console.log('[Insider] Received redeem position request from popup');
                handleRedeemPosition(
                    message.conditionId,
                    message.negRisk,
                    message.walletAddress
                ).then(sendResponse);
                return true; // Keep channel open for async response
            }
            return false;
        };

        chrome.runtime.onMessage.addListener(messageListener);

        // Cleanup
        return () => {
            observerRef.current?.disconnect();
            chrome.runtime.onMessage.removeListener(messageListener);

            // Clean up React roots
            cardRoots.forEach((root, container) => {
                root.unmount();
                container.remove();
            });
            cardRoots.clear();
        };
    }, [handleMutations]);

    // This component doesn't render anything visible itself
    // It just sets up the mutation observer
    return null;
}
