import { createBackup, backupDeployment } from './core';
import { readRecovery } from '../market/recovery';

export function downloadOrderBackup(account: string) {
  const backup = createBackup(account, readRecovery(localStorage, backupDeployment, account));
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = `garuda-orders-${account.toLowerCase()}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return backup.orders.length;
}
