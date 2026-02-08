# Insider - Technical Documentation

<div align="center">

![Insider Logo](https://raw.githubusercontent.com/kunalshah017/Insider/cfc4e618fd4083b54f9207167b80665db420ebcd/extension/chrome-extension/public/logo_horizontal_dark.png)

**Trade Polymarket directly from Twitter/X**

[![React](https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vite.dev)
[![Polygon](https://img.shields.io/badge/Polygon-8247E5?style=flat-square&logo=polygon&logoColor=white)](https://polygon.technology)

</div>

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [System Flow Diagrams](#system-flow-diagrams)
4. [Extension Structure](#extension-structure)
5. [Server Structure](#server-structure)
6. [Key Integrations](#key-integrations)
   - [Polymarket Integration](#polymarket-integration)
   - [Uniswap v4 Integration](#uniswap-v4-integration)
7. [Core Components](#core-components)
8. [Message Flow](#message-flow)
9. [Smart Contract Interactions](#smart-contract-interactions)
10. [API Reference](#api-reference)
11. [File Reference](#file-reference)

---

## Overview

**Insider** is a Chrome extension that enables seamless trading on Polymarket prediction markets directly from Twitter/X. When users encounter tweets containing Polymarket links, the extension injects an interactive trading card, allowing them to:

- View real-time market prices with animated updates
- Place buy/sell orders with MetaMask integration
- Swap tokens to USDC.e via Uniswap v4
- Manage positions and orders via popup
- Redeem winnings from resolved markets

### Key Features

| Feature                 | Description                                                             |
| ----------------------- | ----------------------------------------------------------------------- |
| **Twitter Integration** | Automatically detects Polymarket links in tweets and injects trading UI |
| **Real-time Prices**    | WebSocket connection for live price updates                             |
| **Uniswap v4 Swaps**    | Convert any token to USDC.e for trading                                 |
| **Order Management**    | View holdings, open orders, and trade history                           |
| **Position Redemption** | Claim winnings directly from resolved markets                           |
| **Session Management**  | Persistent wallet sessions with API credentials                         |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              INSIDER ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐    │
│  │   TWITTER/X      │     │  CHROME POPUP    │     │  INSIDER SERVER  │    │
│  │   (Content UI)   │     │   (React App)    │     │   (Express.js)   │    │
│  └────────┬─────────┘     └────────┬─────────┘     └────────┬─────────┘    │
│           │                        │                        │               │
│           │    Chrome Messages     │                        │               │
│           └────────────┬───────────┘                        │               │
│                        │                                    │               │
│                        ▼                                    │               │
│           ┌────────────────────────┐                        │               │
│           │   BACKGROUND SCRIPT    │◄───────────────────────┘               │
│           │   (Service Worker)     │     HTTP + Builder Headers             │
│           └────────────┬───────────┘                                        │
│                        │                                                     │
│           ┌────────────┴────────────────────────────────┐                   │
│           │                                              │                   │
│           ▼                                              ▼                   │
│  ┌─────────────────┐                        ┌─────────────────────┐         │
│  │  POLYMARKET     │                        │     POLYGON         │         │
│  │  APIs           │                        │     BLOCKCHAIN      │         │
│  │  - Gamma API    │                        │     - CTF Contract  │         │
│  │  - CLOB API     │                        │     - Exchanges     │         │
│  │  - WebSocket    │                        │     - Uniswap v4    │         │
│  └─────────────────┘                        └─────────────────────┘         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Breakdown

| Layer          | Technology             | Purpose                                     |
| -------------- | ---------------------- | ------------------------------------------- |
| **Content UI** | React + TypeScript     | Injects trading cards into Twitter DOM      |
| **Popup**      | React + TypeScript     | Portfolio management interface              |
| **Background** | Service Worker         | API proxy, message routing, session storage |
| **Server**     | Express.js             | Builder authentication, order signing       |
| **Blockchain** | Polygon (chainId: 137) | Smart contract interactions                 |

---

## System Flow Diagrams

### Order Placement Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   USER      │    │  CONTENT    │    │ BACKGROUND  │    │   SERVER    │    │ POLYMARKET  │
│             │    │   SCRIPT    │    │   SCRIPT    │    │             │    │    CLOB     │
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘
       │                  │                  │                  │                  │
       │ Click YES/NO     │                  │                  │                  │
       │─────────────────►│                  │                  │                  │
       │                  │                  │                  │                  │
       │                  │ Check Balance    │                  │                  │
       │                  │ & Approvals      │                  │                  │
       │                  │──────────────────►                  │                  │
       │                  │                  │                  │                  │
       │                  │◄─────────────────│                  │                  │
       │                  │ Balance OK       │                  │                  │
       │                  │                  │                  │                  │
       │  MetaMask Sign   │                  │                  │                  │
       │◄─────────────────│                  │                  │                  │
       │  EIP-712 Typed   │                  │                  │                  │
       │─────────────────►│                  │                  │                  │
       │                  │                  │                  │                  │
       │                  │ Submit Signed    │                  │                  │
       │                  │ Order            │                  │                  │
       │                  │─────────────────►│                  │                  │
       │                  │                  │                  │                  │
       │                  │                  │ Add L2 Headers   │                  │
       │                  │                  │─────────────────►│                  │
       │                  │                  │                  │                  │
       │                  │                  │                  │ Add Builder     │
       │                  │                  │                  │ Headers         │
       │                  │                  │                  │─────────────────►
       │                  │                  │                  │                  │
       │                  │                  │                  │◄─────────────────│
       │                  │                  │◄─────────────────│  Order ID       │
       │                  │◄─────────────────│                  │                  │
       │◄─────────────────│  Success!        │                  │                  │
       │                  │                  │                  │                  │
```

### Uniswap v4 Swap Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   USER      │    │  SWAP       │    │  ETHEREUM   │    │  UNISWAP    │
│             │    │  MODAL      │    │  BRIDGE     │    │  V4 ROUTER  │
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘
       │                  │                  │                  │
       │ Select Token     │                  │                  │
       │ Enter Amount     │                  │                  │
       │─────────────────►│                  │                  │
       │                  │                  │                  │
       │                  │ Get Quote        │                  │
       │                  │ (ethCall)        │                  │
       │                  │─────────────────►│                  │
       │                  │                  │                  │
       │                  │                  │ quoteExactInput  │
       │                  │                  │─────────────────►│
       │                  │                  │                  │
       │                  │◄─────────────────│◄─────────────────│
       │                  │ Quote Response   │                  │
       │                  │                  │                  │
       │ Confirm Swap     │                  │                  │
       │─────────────────►│                  │                  │
       │                  │                  │                  │
       │                  │ 1. Approve       │                  │
       │  MetaMask (1/3)  │ Permit2          │                  │
       │◄─────────────────│─────────────────►│                  │
       │─────────────────►│                  │                  │
       │                  │                  │                  │
       │                  │ 2. Approve       │                  │
       │  MetaMask (2/3)  │ Router           │                  │
       │◄─────────────────│─────────────────►│                  │
       │─────────────────►│                  │                  │
       │                  │                  │                  │
       │                  │ 3. Execute       │                  │
       │  MetaMask (3/3)  │ Swap             │                  │
       │◄─────────────────│─────────────────►│─────────────────►│
       │─────────────────►│                  │                  │
       │                  │                  │                  │
       │◄─────────────────│  USDC.e Ready!   │◄─────────────────│
       │                  │                  │                  │
```

### Real-time Price Updates

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        WEBSOCKET PRICE UPDATES                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────┐         ┌──────────────────┐         ┌───────────────┐   │
│   │   TRADING    │◄────────│  useMarketPrices │◄────────│  POLYMARKET   │   │
│   │    CARD      │  State  │      Hook        │   WS    │   WEBSOCKET   │   │
│   │              │ Updates │                  │  Events │               │   │
│   └──────────────┘         └──────────────────┘         └───────────────┘   │
│         │                          │                           │            │
│         ▼                          ▼                           │            │
│   ┌──────────────┐         ┌──────────────────┐                │            │
│   │  ANIMATED    │         │  polymarketWS    │◄───────────────┘            │
│   │   PRICE      │         │   Manager        │                             │
│   │  Component   │         │                  │                             │
│   └──────────────┘         │ • Auto-reconnect │                             │
│                            │ • Heartbeat      │                             │
│   Rolling digit            │ • Multi-market   │                             │
│   animation on             │   subscriptions  │                             │
│   price changes            └──────────────────┘                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Extension Structure

```
extension/
├── chrome-extension/          # Core extension files
│   ├── src/
│   │   └── background/        # Service worker
│   │       └── index.ts       # Message handling, API proxy
│   ├── manifest.ts            # Extension manifest
│   └── public/                # Static assets
│
├── packages/                  # Shared modules
│   ├── shared/lib/
│   │   ├── polymarket/        # Polymarket API integration
│   │   │   ├── api.ts         # Market data fetching
│   │   │   ├── websocket.ts   # Real-time price updates
│   │   │   ├── constants.ts   # Contract addresses
│   │   │   ├── types.ts       # TypeScript interfaces
│   │   │   ├── utils.ts       # URL parsing utilities
│   │   │   └── session-types.ts
│   │   │
│   │   └── uniswap/           # Uniswap v4 integration
│   │       ├── constants.ts   # V4 contract addresses
│   │       ├── swap-service.ts # Quote & swap execution
│   │       └── index.ts       # Public exports
│   │
│   ├── env/                   # Environment configuration
│   ├── storage/               # Chrome storage abstraction
│   └── ui/                    # Shared UI components
│
├── pages/
│   ├── content-ui/src/        # Injected UI on Twitter
│   │   ├── matches/twitter/
│   │   │   ├── App.tsx        # Main content script
│   │   │   └── components/
│   │   │       ├── TradingCard.tsx      # Main trading UI
│   │   │       ├── InlineTradingPanel.tsx
│   │   │       ├── SwapModal.tsx        # Uniswap v4 swap UI
│   │   │       └── OrderModal.tsx
│   │   │
│   │   ├── hooks/
│   │   │   ├── useOrder.ts       # Order placement logic
│   │   │   ├── useMarketPrices.ts # WebSocket price hook
│   │   │   └── useWallet.ts      # Wallet connection
│   │   │
│   │   ├── utils/
│   │   │   ├── order-builder.ts  # EIP-712 order signing
│   │   │   ├── token-utils.ts    # Balance & approval checks
│   │   │   └── chrome-messaging.ts
│   │   │
│   │   ├── ethereum-bridge.ts    # MetaMask communication
│   │   └── components/
│   │       └── AnimatedPrice.tsx # Rolling price animation
│   │
│   └── popup/src/             # Extension popup
│       ├── Popup.tsx          # Main popup component
│       ├── Popup.css          # Styles
│       ├── components/
│       │   └── OrderManagement.tsx # Holdings & orders
│       └── providers/
│           └── WalletContext.tsx
```

---

## Server Structure

```
server/
├── src/
│   ├── index.ts              # Express app entry point
│   ├── lib/
│   │   └── builder-signer.ts # HMAC signature generation
│   └── routes/
│       ├── order.ts          # Order submission proxy
│       ├── sign.ts           # Remote signing endpoint
│       ├── geoblock.ts       # Geolocation check
│       └── health.ts         # Health check
├── package.json
└── .env                      # Builder API credentials
```

### Server Endpoints

| Endpoint              | Method | Description                              |
| --------------------- | ------ | ---------------------------------------- |
| `/api/order`          | POST   | Submits signed orders to Polymarket CLOB |
| `/api/order/:orderId` | GET    | Gets order status                        |
| `/api/sign`           | POST   | Remote signing for Builder auth          |
| `/api/geoblock`       | GET    | Checks if user is geoblocked             |
| `/api/health`         | GET    | Server health check                      |

---

## Key Integrations

### Polymarket Integration

#### APIs Used

| API           | Base URL                                     | Purpose                              |
| ------------- | -------------------------------------------- | ------------------------------------ |
| **Gamma API** | `https://gamma-api.polymarket.com`           | Market metadata, event info          |
| **CLOB API**  | `https://clob.polymarket.com`                | Order book, prices, order submission |
| **WebSocket** | `wss://ws-subscriptions-clob.polymarket.com` | Real-time price updates              |
| **Data API**  | `https://data-api.polymarket.com`            | User positions, trade history        |

#### Key Files

| File                                                                                                 | Purpose              |
| ---------------------------------------------------------------------------------------------------- | -------------------- |
| [packages/shared/lib/polymarket/api.ts](extension/packages/shared/lib/polymarket/api.ts)             | Market data fetching |
| [packages/shared/lib/polymarket/websocket.ts](extension/packages/shared/lib/polymarket/websocket.ts) | WebSocket manager    |
| [packages/shared/lib/polymarket/constants.ts](extension/packages/shared/lib/polymarket/constants.ts) | Contract addresses   |
| [chrome-extension/src/background/index.ts](extension/chrome-extension/src/background/index.ts)       | API proxy            |

#### Contract Addresses (Polygon)

| Contract                     | Address                                      |
| ---------------------------- | -------------------------------------------- |
| **CTF (Conditional Tokens)** | `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045` |
| **CTF Exchange**             | `0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E` |
| **Neg Risk CTF Exchange**    | `0xC5d563A36AE78145C45a50134d48A1215220f80a` |
| **USDC.e**                   | `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` |

---

### Uniswap v4 Integration

The extension integrates **Uniswap v4** on Polygon to enable users to swap any supported token to USDC.e, which is required for trading on Polymarket.

#### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         UNISWAP V4 SWAP ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────┐     ┌─────────────────┐     ┌─────────────────────────┐   │
│   │   INPUT     │     │    PERMIT2      │     │   UNIVERSAL ROUTER      │   │
│   │   TOKEN     │────►│   (Approval)    │────►│   (V4_SWAP Command)     │   │
│   │  (ERC-20)   │     │                 │     │                         │   │
│   └─────────────┘     └─────────────────┘     └───────────┬─────────────┘   │
│                                                            │                 │
│                                                            ▼                 │
│                       ┌─────────────────┐     ┌─────────────────────────┐   │
│                       │   POOL MANAGER  │◄────│      V4 PLANNER         │   │
│                       │                 │     │   • SWAP_EXACT_IN       │   │
│                       │   Pool Key:     │     │   • SETTLE_ALL          │   │
│                       │   • currency0   │     │   • TAKE_ALL            │   │
│                       │   • currency1   │     └─────────────────────────┘   │
│                       │   • fee         │                                    │
│                       │   • tickSpacing │                                    │
│                       │   • hooks       │                                    │
│                       └────────┬────────┘                                    │
│                                │                                             │
│                                ▼                                             │
│                       ┌─────────────────┐                                    │
│                       │    USDC.e       │                                    │
│                       │   (Output)      │                                    │
│                       └─────────────────┘                                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Uniswap v4 Contract Addresses (Polygon)

| Contract             | Address                                      |
| -------------------- | -------------------------------------------- |
| **Pool Manager**     | `0x67366782805870060151383f4bbff9dab53e5cd6` |
| **Quoter**           | `0xb3d5c3dfc3a7aebff71895a7191796bffc2c81b9` |
| **Universal Router** | `0x1095692a6237d83c6a72f3f5efedb9a670c49223` |
| **Permit2**          | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| **Position Manager** | `0x1ec2ebf4f37e7363fdfe3551602425af0b3ceef9` |
| **State View**       | `0x5ea1bd7974c8a611cbab0bdcafcb1d9cc9b3ba5a` |

#### Supported Tokens

| Token      | Address                                      | Decimals |
| ---------- | -------------------------------------------- | -------- |
| **WPOL**   | `0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270` | 18       |
| **USDC.e** | `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` | 6        |
| **USDC**   | `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` | 6        |
| **WETH**   | `0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619` | 18       |
| **DAI**    | `0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063` | 18       |
| **USDT**   | `0xc2132D05D31c914a87C6611C10748AEb04B58e8F` | 6        |

#### Key Files

| File                                                                                                                                     | Purpose                  |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| [packages/shared/lib/uniswap/constants.ts](extension/packages/shared/lib/uniswap/constants.ts)                                           | V4 addresses, token info |
| [packages/shared/lib/uniswap/swap-service.ts](extension/packages/shared/lib/uniswap/swap-service.ts)                                     | Quote & swap execution   |
| [pages/content-ui/src/matches/twitter/components/SwapModal.tsx](extension/pages/content-ui/src/matches/twitter/components/SwapModal.tsx) | Swap UI component        |

#### Swap Service Functions

```typescript
// Get swap quote
getSwapQuoteViaEthCall(ethCall, inputToken, inputAmount, slippageTolerance);

// Check Permit2 approval
checkPermit2ApprovalViaEthCall(ethCall, token, userAddress, amount);

// Approve token for Permit2
approveTokenForPermit2ViaBridge(sendTransaction, token, userAddress, amount);

// Approve Universal Router on Permit2
approveUniversalRouterViaBridge(sendTransaction, token, amount, userAddress);

// Execute swap
executeSwapViaBridge(sendTransaction, quote, userAddress, deadline);
```

#### Fee Tiers

| Tier   | Fee         | Tick Spacing |
| ------ | ----------- | ------------ |
| LOWEST | 0.01% (100) | 1            |
| LOW    | 0.05% (500) | 10           |
| MEDIUM | 0.3% (3000) | 60           |
| HIGH   | 1% (10000)  | 200          |

---

## Core Components

### TradingCard

The main UI component injected into Twitter tweets containing Polymarket links.

**File:** [pages/content-ui/src/matches/twitter/components/TradingCard.tsx](extension/pages/content-ui/src/matches/twitter/components/TradingCard.tsx)

**Features:**

- Displays market question and metadata
- Shows real-time YES/NO prices with animations
- Buy/Sell buttons with order modal
- Resolved market state with winner display
- Link to Polymarket

### AnimatedPrice

Rolling digit animation for price changes.

**File:** [pages/content-ui/src/components/AnimatedPrice.tsx](extension/pages/content-ui/src/components/AnimatedPrice.tsx)

**Features:**

- CSS-based rolling animation
- Per-digit transitions
- Direction-aware (up/down) animations

### SwapModal

Token swap interface using Uniswap v4.

**File:** [pages/content-ui/src/matches/twitter/components/SwapModal.tsx](extension/pages/content-ui/src/matches/twitter/components/SwapModal.tsx)

**Features:**

- Token selection dropdown
- Real-time quote fetching
- Slippage settings
- Multi-step swap with progress tracking
- Error handling

### OrderManagement

Popup component for managing positions and orders.

**File:** [pages/popup/src/components/OrderManagement.tsx](extension/pages/popup/src/components/OrderManagement.tsx)

**Features:**

- Holdings tab with position details
- Orders tab with open/filled orders
- Sell functionality
- Position redemption

---

## Message Flow

### Chrome Message Types

```typescript
type MessageType =
  | { type: "FETCH_EVENT"; slug: string }
  | { type: "FETCH_MARKET"; slug: string }
  | { type: "FETCH_PRICE"; tokenId: string; side: "buy" | "sell" }
  | { type: "FETCH_ORDERBOOK"; tokenId: string }
  | { type: "GET_TRADING_SESSION" }
  | {
      type: "SUBMIT_SIGNED_ORDER";
      signedOrder: any;
      credentials: any;
      negRisk: boolean;
    }
  | { type: "GET_SAFE_BALANCE"; safeAddress: string }
  | { type: "FETCH_OPEN_ORDERS" }
  | { type: "FETCH_TRADE_HISTORY" }
  | { type: "CANCEL_ORDER"; orderId: string }
  | { type: "CANCEL_ALL_ORDERS" }
  | { type: "FETCH_POSITIONS" }
  | {
      type: "SELL_SHARES";
      tokenId: string;
      size: string;
      price: string;
      negRisk?: boolean;
    }
  | { type: "REDEEM_POSITION"; conditionId: string; negRisk?: boolean }
  | { type: "RESOLVE_TCO_LINK"; url: string };
```

### Ethereum Bridge Messages

```typescript
// Content script ↔ Injected script communication
"INSIDER_WALLET_CHECK"; // Check if MetaMask available
"INSIDER_WALLET_CONNECT"; // Request wallet connection
"INSIDER_WALLET_SWITCH_CHAIN"; // Switch to Polygon
"INSIDER_WALLET_SIGN_TYPED_DATA"; // EIP-712 signing
"INSIDER_WALLET_ETH_CALL"; // Read contract data
"INSIDER_WALLET_GET_BALANCE"; // Get native balance
"INSIDER_WALLET_SEND_TX"; // Send transaction
```

---

## Smart Contract Interactions

### Order Signing (EIP-712)

```typescript
// Domain for CTF Exchange
const domain = {
  name: "Polymarket CTF Exchange",
  version: "1",
  chainId: 137,
  verifyingContract: "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E", // or Neg Risk Exchange
};

// Order type definition
const types = {
  Order: [
    { name: "salt", type: "uint256" },
    { name: "maker", type: "address" },
    { name: "signer", type: "address" },
    { name: "taker", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "makerAmount", type: "uint256" },
    { name: "takerAmount", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "feeRateBps", type: "uint256" },
    { name: "side", type: "uint8" },
    { name: "signatureType", type: "uint8" },
  ],
};
```

### Position Redemption

```typescript
// CTF redeemPositions call
function redeemPositions(
  address collateralToken,    // USDC.e address
  bytes32 parentCollectionId, // HashZero for Polymarket
  bytes32 conditionId,        // Market condition ID
  uint256[] indexSets         // [1, 2] for YES and NO
)
```

### Token Approvals

| Action             | Contract    | Spender               |
| ------------------ | ----------- | --------------------- |
| Trading (regular)  | USDC.e      | CTF Exchange          |
| Trading (neg risk) | USDC.e      | Neg Risk CTF Exchange |
| Swap (Permit2)     | Input Token | Permit2               |
| Swap (Router)      | Permit2     | Universal Router      |

---

## API Reference

### Polymarket Gamma API

```
GET /events?slug={slug}
GET /markets?slug={slug}
```

### Polymarket CLOB API

```
GET /price?token_id={tokenId}&side={buy|sell}
GET /book?token_id={tokenId}
POST /order (with L2 + Builder headers)
DELETE /order/{orderId}
```

### Polymarket Data API

```
GET /positions?address={address}
GET /orders?address={address}&status={status}
GET /trades?address={address}
```

### Builder Authentication Headers

| Header                    | Description           |
| ------------------------- | --------------------- |
| `POLY_BUILDER_API_KEY`    | Builder API key       |
| `POLY_BUILDER_TIMESTAMP`  | Unix timestamp        |
| `POLY_BUILDER_PASSPHRASE` | Builder passphrase    |
| `POLY_BUILDER_SIGNATURE`  | HMAC-SHA256 signature |

### L2 Authentication Headers

| Header            | Description           |
| ----------------- | --------------------- |
| `POLY_ADDRESS`    | User's wallet address |
| `POLY_API_KEY`    | User's API key        |
| `POLY_PASSPHRASE` | User's passphrase     |
| `POLY_TIMESTAMP`  | Unix timestamp        |
| `POLY_SIGNATURE`  | HMAC-SHA256 signature |

---

## File Reference

### Extension Core

| Path                                       | Description               |
| ------------------------------------------ | ------------------------- |
| `chrome-extension/src/background/index.ts` | Background service worker |
| `chrome-extension/manifest.ts`             | Extension manifest        |
| `packages/env/.env`                        | Environment variables     |

### Polymarket Integration

| Path                                              | Description        |
| ------------------------------------------------- | ------------------ |
| `packages/shared/lib/polymarket/api.ts`           | API client         |
| `packages/shared/lib/polymarket/websocket.ts`     | WebSocket manager  |
| `packages/shared/lib/polymarket/constants.ts`     | Contract addresses |
| `packages/shared/lib/polymarket/types.ts`         | TypeScript types   |
| `packages/shared/lib/polymarket/utils.ts`         | URL parsing        |
| `packages/shared/lib/polymarket/session-types.ts` | Session types      |

### Uniswap v4 Integration

| Path                                          | Description           |
| --------------------------------------------- | --------------------- |
| `packages/shared/lib/uniswap/constants.ts`    | V4 addresses & tokens |
| `packages/shared/lib/uniswap/swap-service.ts` | Quote & swap logic    |
| `packages/shared/lib/uniswap/index.ts`        | Public exports        |

### Content UI

| Path                                                              | Description      |
| ----------------------------------------------------------------- | ---------------- |
| `pages/content-ui/src/matches/twitter/App.tsx`                    | Main entry point |
| `pages/content-ui/src/matches/twitter/components/TradingCard.tsx` | Trading UI       |
| `pages/content-ui/src/matches/twitter/components/SwapModal.tsx`   | Swap UI          |
| `pages/content-ui/src/matches/twitter/components/OrderModal.tsx`  | Order UI         |
| `pages/content-ui/src/hooks/useOrder.ts`                          | Order hook       |
| `pages/content-ui/src/hooks/useMarketPrices.ts`                   | Price hook       |
| `pages/content-ui/src/ethereum-bridge.ts`                         | MetaMask bridge  |
| `pages/content-ui/src/utils/order-builder.ts`                     | EIP-712 orders   |
| `pages/content-ui/src/components/AnimatedPrice.tsx`               | Price animation  |

### Popup

| Path                                             | Description     |
| ------------------------------------------------ | --------------- |
| `pages/popup/src/Popup.tsx`                      | Main popup      |
| `pages/popup/src/Popup.css`                      | Styles          |
| `pages/popup/src/components/OrderManagement.tsx` | Portfolio       |
| `pages/popup/src/providers/WalletContext.tsx`    | Wallet provider |

### Server

| Path                               | Description    |
| ---------------------------------- | -------------- |
| `server/src/index.ts`              | Express entry  |
| `server/src/routes/order.ts`       | Order proxy    |
| `server/src/routes/sign.ts`        | Remote signing |
| `server/src/lib/builder-signer.ts` | HMAC signing   |

---

## Environment Variables

### Extension

```env
CEB_SERVER_URL=http://localhost:3001
CEB_CLOB_API_URL=https://clob.polymarket.com
CEB_GAMMA_API_URL=https://gamma-api.polymarket.com
CEB_DATA_API_URL=https://data-api.polymarket.com
```

### Server

```env
POLY_BUILDER_API_KEY=your-builder-api-key
POLY_BUILDER_SECRET=your-builder-secret
POLY_BUILDER_PASSPHRASE=your-builder-passphrase
CLOB_API_URL=https://clob.polymarket.com
PORT=3001
```

---

## Development

### Prerequisites

- Node.js 18+
- pnpm 8+
- Chrome browser

### Installation

```bash
# Clone repository
git clone https://github.com/kunalshah017/Insider.git
cd Insider

# Install extension dependencies
cd extension
pnpm install

# Install server dependencies
cd ../server
pnpm install
```

### Build & Run

```bash
# Build extension
cd extension
pnpm run build

# Run server
cd ../server
pnpm run dev
```

### Load Extension in Chrome

1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `extension/dist` folder

---

## License

MIT License - See [LICENSE](LICENSE) for details.
