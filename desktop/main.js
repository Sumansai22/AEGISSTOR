/**
 * AEGISSTOR Desktop Main Process
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

let mainWindow = null;
let pythonProcess = null;

const BACKEND_PORT = 8000;
const BACKEND_HOST = '127.0.0.1';
const BACKEND_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}`;

function startPythonBackend() {
  const backendDir = path.join(__dirname, '..', 'backend');
  console.log(`[Electron] Launching Python FastAPI backend from: ${backendDir}`);

  // Launch local Python backend
  pythonProcess = spawn('python', [
    '-m', 'uvicorn',
    'app.main:app',
    '--host', BACKEND_HOST,
    '--port', BACKEND_PORT.toString()
  ], {
    cwd: backendDir,
    shell: true,
    stdio: 'pipe'
  });

  pythonProcess.stdout.on('data', (data) => {
    console.log(`[Python Backend] ${data.toString().trim()}`);
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error(`[Python Backend Error] ${data.toString().trim()}`);
  });

  pythonProcess.on('close', (code) => {
    console.log(`[Python Backend] Process exited with code ${code}`);
  });
}

function checkBackendHealth(retries = 25, delay = 600) {
  return new Promise((resolve, reject) => {
    const attempt = (remaining) => {
      http.get(`${BACKEND_URL}/api/health`, (res) => {
        if (res.statusCode === 200) {
          resolve(true);
        } else if (remaining > 0) {
          setTimeout(() => attempt(remaining - 1), delay);
        } else {
          reject(new Error('Backend returned non-200 status'));
        }
      }).on('error', () => {
        if (remaining > 0) {
          setTimeout(() => attempt(remaining - 1), delay);
        } else {
          reject(new Error('Backend connection timed out'));
        }
      });
    };
    attempt(retries);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    backgroundColor: '#070b14',
    title: 'AEGISSTOR - Predictive Storage Management',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.setMenuBarVisibility(false);

  // Load production built frontend if available, else Vite dev server
  const distPath = path.join(__dirname, '..', 'frontend', 'dist', 'index.html');
  const fs = require('fs');
  if (fs.existsSync(distPath)) {
    mainWindow.loadFile(distPath);
  } else {
    mainWindow.loadURL('http://localhost:5173');
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(async () => {
  startPythonBackend();

  try {
    console.log('[Electron] Awaiting FastAPI backend initialization...');
    await checkBackendHealth();
    console.log('[Electron] Backend healthy. Opening desktop window.');
  } catch (err) {
    console.warn('[Electron] Backend health check warning:', err.message);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (pythonProcess) {
    console.log('[Electron] Terminating Python child process safely...');
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', pythonProcess.pid.toString(), '/f', '/t']);
    } else {
      pythonProcess.kill('SIGTERM');
    }
    pythonProcess = null;
  }
});
