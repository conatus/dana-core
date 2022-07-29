/** @jsxImportSource theme-ui */

import { FC, useCallback } from 'react';
import { Button, Heading } from 'theme-ui';
import { OpenArchive } from '../../common/interfaces/archive.interfaces';
import { useRPC } from '../ipc/ipc.hooks';
import { WindowDragArea } from '../ui/window';

/**
 * Root component for a window shown on first launch
 */
export const InitialScreen: FC = () => {
  const rpc = useRPC();
  const openArchive = useCallback(async () => {
    const res = await rpc(OpenArchive, {});

    if (res.status === 'ok') {
      window.close();
    }
  }, [rpc]);

  const newArchive = useCallback(async () => {
    const res = await rpc(OpenArchive, { create: true });

    if (res.status === 'ok') {
      window.close();
    }
  }, [rpc]);

  const buttonStyling = {
    background: '#001FCD',
    border: '1px solid #001FCD',
    width: '100%',
    height: '36px',
    fontStyle: 'normal',
    fontWeight: 700,
    fontSize: '12px',
    lineHeight: '16px'
  };

  return (
    <WindowDragArea
      sx={{
        display: 'flex',
        flex: 1,
        p: 6,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        bg: 'primary',
        color: 'primaryContrast'
      }}
    >
      <span sx={{ flex: 1 }} />

      <Button
        onClick={newArchive}
        sx={{ ...buttonStyling, marginBottom: '20px' }}
      >
        New Archive
      </Button>

      <Button
        onClick={openArchive}
        sx={{
          ...buttonStyling,
          backgroundColor: 'white',
          color: '#001FCD'
        }}
      >
        Load archive
      </Button>

      <span sx={{ flex: 1 }} />
    </WindowDragArea>
  );
};
