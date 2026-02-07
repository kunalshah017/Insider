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

      {/* Footer */}
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
    </div>
  );
}

function MultiMarketCard({ data, fullUrl }: { data: MultiMarketData; fullUrl: string }) {
  const activeMarkets = data.markets.filter(m => !m.closed);
  const closedMarkets = data.markets.filter(m => m.closed);
  const displayMarkets = activeMarkets.length > 0 ? activeMarkets.slice(0, 6) : closedMarkets.slice(0, 3);

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

      {/* Markets List */}
      <div
        style={{
          maxHeight: '280px',
          overflowY: 'auto',
          padding: '8px',
        }}
      >
        {displayMarkets.map((market) => (
          <div
            key={market.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              marginBottom: '4px',
              background: market.closed 
                ? 'rgba(113, 118, 123, 0.1)' 
                : 'rgba(255, 255, 255, 0.05)',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.05)',
            }}
          >
            <div style={{ flex: 1, minWidth: 0, marginRight: '12px' }}>
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: 500,
                  color: market.closed ? '#71767b' : '#e7e9ea',
                  lineHeight: 1.3,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {market.groupItemTitle || market.question}
              </div>
              {market.closed && (
                <span
                  style={{
                    fontSize: '10px',
                    color: '#71767b',
                    marginTop: '2px',
                    display: 'inline-block',
                  }}
                >
                  Resolved
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '6px 10px',
                  background: market.closed 
                    ? 'rgba(113, 118, 123, 0.15)' 
                    : 'rgba(34, 197, 94, 0.15)',
                  border: market.closed 
                    ? '1px solid rgba(113, 118, 123, 0.2)' 
                    : '1px solid rgba(34, 197, 94, 0.3)',
                  borderRadius: '8px',
                  minWidth: '52px',
                }}
              >
                <span
                  style={{
                    fontSize: '9px',
                    fontWeight: 500,
                    color: market.closed ? '#71767b' : '#22c55e',
                    marginBottom: '2px',
                  }}
                >
                  YES
                </span>
                <span
                  style={{
                    fontSize: '15px',
                    fontWeight: 700,
                    color: market.closed ? '#71767b' : '#22c55e',
                  }}
                >
                  {formatPriceAsPercent(market.yesPrice)}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '6px 10px',
                  background: market.closed 
                    ? 'rgba(113, 118, 123, 0.15)' 
                    : 'rgba(239, 68, 68, 0.15)',
                  border: market.closed 
                    ? '1px solid rgba(113, 118, 123, 0.2)' 
                    : '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '8px',
                  minWidth: '52px',
                }}
              >
                <span
                  style={{
                    fontSize: '9px',
                    fontWeight: 500,
                    color: market.closed ? '#71767b' : '#ef4444',
                    marginBottom: '2px',
                  }}
                >
                  NO
                </span>
                <span
                  style={{
                    fontSize: '15px',
                    fontWeight: 700,
                    color: market.closed ? '#71767b' : '#ef4444',
                  }}
                >
                  {formatPriceAsPercent(market.noPrice)}
                </span>
              </div>
            </div>
          </div>
        ))}
        
        {/* Show more indicator */}
        {activeMarkets.length > 6 && (
          <div
            style={{
              textAlign: 'center',
              padding: '8px',
              fontSize: '12px',
              color: '#71767b',
            }}
          >
            +{activeMarkets.length - 6} more markets
          </div>
        )}
      </div>

      {/* Footer */}
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
