'use client';

import {
  THEME,
  TonConnectUIProvider,
} from '@tonconnect/ui-react';

export default function TonConnectProvider({
  children,
  manifestUrl,
  twaReturnUrl = '',
}) {
  const actionsConfiguration = {
    modals: ['before', 'success', 'error'],
    notifications: ['error'],
    returnStrategy: 'back',
    ...(twaReturnUrl ? { twaReturnUrl } : {}),
  };

  return (
    <TonConnectUIProvider
      manifestUrl={manifestUrl}
      language="en"
      restoreConnection
      uiPreferences={{
        theme: THEME.DARK,
        borderRadius: 'm',
      }}
      actionsConfiguration={actionsConfiguration}
    >
      {children}
    </TonConnectUIProvider>
  );
}
