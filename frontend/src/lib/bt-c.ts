export const BT_C_WELCOME_GRANT = 5000;

/**
 * Apply the one-time in-app BT-c welcome credit to the signed-in platform
 * account or, for wallet-only visitors, a local profile keyed to their wallet.
 * A separate claim marker keeps the grant one-time after the balance is spent.
 */
export function grantBtCWelcomeBalance(walletAddress?: string): boolean {
  const signedInUserId = localStorage.getItem('token');
  const normalizedWalletAddress = walletAddress?.startsWith('0x')
    ? walletAddress.toLowerCase()
    : walletAddress;
  const walletUserId = normalizedWalletAddress ? `wallet_${normalizedWalletAddress}` : null;
  const userId = signedInUserId || walletUserId;
  if (!userId) return false;

  const users = JSON.parse(localStorage.getItem('platform_users') || '[]');
  let userIndex = users.findIndex((user: any) => user.id === userId);
  if (userIndex === -1 && walletAddress) {
    const existingWalletIndex = users.findIndex((user: any) =>
      (user.walletAddress?.startsWith('0x') ? user.walletAddress.toLowerCase() : user.walletAddress)
        === normalizedWalletAddress
    );
    if (existingWalletIndex !== -1) userIndex = existingWalletIndex;
  }

  if (userIndex === -1) {
    users.push({
      id: userId,
      name: walletAddress ? `Wallet ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : 'User',
      email: localStorage.getItem('user_email') || '',
      role: 'USER',
      walletAddress: walletAddress || '',
      balance: { USDT: 0, ETH: 0 },
      createdAt: new Date().toISOString()
    });
    userIndex = users.length - 1;
  }

  const user = users[userIndex];
  if (walletAddress) user.walletAddress = walletAddress;
  if (!signedInUserId) localStorage.setItem('token', user.id);
  const balance = user.balance || {};
  if (user.btCWelcomeGrantClaimed) {
    users[userIndex] = user;
    localStorage.setItem('platform_users', JSON.stringify(users));
    return false;
  }

  user.balance = {
    ...balance,
    'BT-c': Math.max(Number(balance['BT-c']) || 0, BT_C_WELCOME_GRANT)
  };
  user.btCWelcomeGrantClaimed = true;
  users[userIndex] = user;
  localStorage.setItem('platform_users', JSON.stringify(users));
  window.dispatchEvent(new Event('balanceUpdated'));
  return true;
}
