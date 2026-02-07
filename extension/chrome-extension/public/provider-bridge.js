// Provider Bridge - Injected into page context to access window.ethereum
// This file is loaded as a web accessible resource to avoid CSP inline script issues

(function () {
  if (window.__INSIDER_BRIDGE_LOADED__) return;
  window.__INSIDER_BRIDGE_LOADED__ = true;

  window.addEventListener('message', async function (event) {
    if (event.source !== window) return;

    var data = event.data;
    if (!data || !data.type || !data.type.startsWith('INSIDER_WALLET_')) return;

    var type = data.type;
    var id = data.id;
    var payload = data.payload;
    var ethereum = window.ethereum;

    try {
      switch (type) {
        case 'INSIDER_WALLET_CHECK':
          window.postMessage(
            {
              type: 'INSIDER_WALLET_RESPONSE',
              id: id,
              success: true,
              data: {
                hasProvider: !!ethereum,
                isMetaMask: ethereum ? !!ethereum.isMetaMask : false,
              },
            },
            '*',
          );
          break;

        case 'INSIDER_WALLET_CONNECT':
          if (!ethereum) {
            window.postMessage(
              {
                type: 'INSIDER_WALLET_RESPONSE',
                id: id,
                success: false,
                error: 'MetaMask not found. Please install MetaMask extension and refresh the page.',
              },
              '*',
            );
            return;
          }

          ethereum
            .request({ method: 'eth_requestAccounts' })
            .then(function (accounts) {
              if (!accounts || accounts.length === 0) {
                window.postMessage(
                  {
                    type: 'INSIDER_WALLET_RESPONSE',
                    id: id,
                    success: false,
                    error: 'No accounts returned from MetaMask',
                  },
                  '*',
                );
                return;
              }
              window.postMessage(
                {
                  type: 'INSIDER_WALLET_RESPONSE',
                  id: id,
                  success: true,
                  data: { accounts: accounts },
                },
                '*',
              );
            })
            .catch(function (err) {
              window.postMessage(
                {
                  type: 'INSIDER_WALLET_RESPONSE',
                  id: id,
                  success: false,
                  error: err.message || 'Failed to connect',
                },
                '*',
              );
            });
          break;

        case 'INSIDER_WALLET_SWITCH_CHAIN':
          if (!ethereum) {
            window.postMessage(
              {
                type: 'INSIDER_WALLET_RESPONSE',
                id: id,
                success: false,
                error: 'No ethereum provider',
              },
              '*',
            );
            return;
          }

          var chainId = payload.chainId;
          var chainParams = payload.chainParams;

          ethereum
            .request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: chainId }],
            })
            .then(function () {
              window.postMessage(
                {
                  type: 'INSIDER_WALLET_RESPONSE',
                  id: id,
                  success: true,
                  data: { chainId: chainId },
                },
                '*',
              );
            })
            .catch(function (switchError) {
              if (switchError.code === 4902 && chainParams) {
                ethereum
                  .request({
                    method: 'wallet_addEthereumChain',
                    params: [chainParams],
                  })
                  .then(function () {
                    window.postMessage(
                      {
                        type: 'INSIDER_WALLET_RESPONSE',
                        id: id,
                        success: true,
                        data: { chainId: chainId, added: true },
                      },
                      '*',
                    );
                  })
                  .catch(function (addError) {
                    window.postMessage(
                      {
                        type: 'INSIDER_WALLET_RESPONSE',
                        id: id,
                        success: false,
                        error: addError.message || 'Failed to add chain',
                      },
                      '*',
                    );
                  });
              } else {
                window.postMessage(
                  {
                    type: 'INSIDER_WALLET_RESPONSE',
                    id: id,
                    success: false,
                    error: switchError.message || 'Failed to switch chain',
                  },
                  '*',
                );
              }
            });
          break;

        case 'INSIDER_WALLET_SIGN_TYPED_DATA':
          if (!ethereum) {
            window.postMessage(
              {
                type: 'INSIDER_WALLET_RESPONSE',
                id: id,
                success: false,
                error: 'No ethereum provider',
              },
              '*',
            );
            return;
          }

          var address = payload.address;
          var typedData = payload.typedData;

          ethereum
            .request({
              method: 'eth_signTypedData_v4',
              params: [address, JSON.stringify(typedData)],
            })
            .then(function (signature) {
              window.postMessage(
                {
                  type: 'INSIDER_WALLET_RESPONSE',
                  id: id,
                  success: true,
                  data: { signature: signature },
                },
                '*',
              );
            })
            .catch(function (signError) {
              window.postMessage(
                {
                  type: 'INSIDER_WALLET_RESPONSE',
                  id: id,
                  success: false,
                  error: signError.message || 'Failed to sign message',
                },
                '*',
              );
            });
          break;

        case 'INSIDER_WALLET_ETH_CALL':
          if (!ethereum) {
            window.postMessage(
              {
                type: 'INSIDER_WALLET_RESPONSE',
                id: id,
                success: false,
                error: 'No ethereum provider',
              },
              '*',
            );
            return;
          }

          var callTo = payload.to;
          var callData = payload.data;

          ethereum
            .request({
              method: 'eth_call',
              params: [{ to: callTo, data: callData }, 'latest'],
            })
            .then(function (result) {
              window.postMessage(
                {
                  type: 'INSIDER_WALLET_RESPONSE',
                  id: id,
                  success: true,
                  data: result,
                },
                '*',
              );
            })
            .catch(function (callError) {
              window.postMessage(
                {
                  type: 'INSIDER_WALLET_RESPONSE',
                  id: id,
                  success: false,
                  error: callError.message || 'Failed to call contract',
                },
                '*',
              );
            });
          break;

        case 'INSIDER_WALLET_SEND_TX':
          if (!ethereum) {
            window.postMessage(
              {
                type: 'INSIDER_WALLET_RESPONSE',
                id: id,
                success: false,
                error: 'No ethereum provider',
              },
              '*',
            );
            return;
          }

          var txParams = {
            to: payload.to,
            from: payload.from,
            data: payload.data,
          };
          if (payload.value) {
            txParams.value = payload.value;
          }

          ethereum
            .request({
              method: 'eth_sendTransaction',
              params: [txParams],
            })
            .then(function (txHash) {
              window.postMessage(
                {
                  type: 'INSIDER_WALLET_RESPONSE',
                  id: id,
                  success: true,
                  data: { hash: txHash },
                },
                '*',
              );
            })
            .catch(function (txError) {
              window.postMessage(
                {
                  type: 'INSIDER_WALLET_RESPONSE',
                  id: id,
                  success: false,
                  error: txError.message || 'Failed to send transaction',
                },
                '*',
              );
            });
          break;
      }
    } catch (err) {
      window.postMessage(
        {
          type: 'INSIDER_WALLET_RESPONSE',
          id: id,
          success: false,
          error: err.message || 'Unknown error',
        },
        '*',
      );
    }
  });

  window.postMessage({ type: 'INSIDER_WALLET_BRIDGE_READY' }, '*');
  console.log('[Insider] Wallet provider bridge loaded');
})();
