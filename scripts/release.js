const { execSync } = require('child_process');

const getCerts = () => {
  if (process.platform === 'darwin') {
    return {
      CSC_LINK: process.env.MAC_CERTS,
      CSC_KEY_PASSWORD: process.env.MAC_CERTS_PASSWORD
    };
  } else if (process.platform === 'win32') {
    return {
      CSC_LINK: process.env.WINDOWS_CERTS,
      CSC_KEY_PASSWORD: process.env.WINDOWS_CERTS_PASSWORD
    };
  }
};

execSync(`yarn electron-builder --publish always`, {
  encoding: 'utf8',
  stdio: 'inherit',
  env: {
    ...process.env,
    ...getCerts()
  }
});
