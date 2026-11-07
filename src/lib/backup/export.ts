import { createBackupFile, backupDeployments, type BackupDeploymentId } from './core';
import { readRecovery } from '../market/recovery';

export function downloadOrderBackup(account: string) {
  const entries = (Object.keys(backupDeployments) as BackupDeploymentId[]).flatMap(deploymentId =>
    readRecovery(localStorage, backupDeployments[deploymentId], account).map(signed => ({ signed, deploymentId })));
  const backup = createBackupFile(account, entries);
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = `garuda-orders-${account.toLowerCase()}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return entries.length;
}
