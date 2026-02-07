import { useEffect, useRef, useCallback } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { TradingCard } from './components/TradingCard';
import { parsePolymarketUrl, type ParsedPolymarketUrl } from '@extension/shared';

// Store roots to clean up later
const cardRoots = new Map<HTMLElement, Root>();

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
function processTweet(tweet: Element) {
  const links = findPolymarketLinks(tweet);

  links.forEach(({ anchor, parsed }) => {
    injectTradingCard(anchor, parsed);
  });
}

/**
 * Scan the page for tweets with Polymarket links
 */
function scanForTweets() {
  // Find all tweet articles
  const tweets = document.querySelectorAll('article[data-testid="tweet"]');

  tweets.forEach((tweet) => {
    processTweet(tweet);
  });
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

    // Cleanup
    return () => {
      observerRef.current?.disconnect();

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
