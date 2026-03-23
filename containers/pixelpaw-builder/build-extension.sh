#!/bin/sh
set -e

echo "=== PixelPaw Extension Builder ==="
echo "Starting build process..."

# Check if source is mounted
if [ ! -d "/source" ]; then
    echo "ERROR: /source directory not found. Mount G:/github/PixelPaw as volume."
    exit 1
fi

cd /source

echo "Installing root dependencies..."
npm install --silent

echo "Installing webview-ui dependencies..."
cd webview-ui
npm install --silent
cd ..

echo "Building extension..."
npm run package

echo "Copying .vsix to public directory..."
cp *.vsix /app/public/pixelpaw.vsix
cp *.vsix /app/public/pixelpaw-latest.vsix

# Copy documentation
echo "Copying documentation..."
if [ -d "docs" ]; then
    cp -r docs/* /app/docs/
fi
cp README.md /app/docs/README.md 2>/dev/null || true
cp GUIDE.md /app/docs/GUIDE.md 2>/dev/null || true

# Generate download page
cat > /app/public/index.html <<'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>PixelPaw Extension Downloads</title>
    <meta charset="UTF-8">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 16px;
            padding: 40px;
            max-width: 600px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        h1 {
            color: #333;
            margin-bottom: 10px;
            font-size: 2.5em;
        }
        .subtitle {
            color: #666;
            margin-bottom: 30px;
            font-size: 1.1em;
        }
        .btn {
            display: inline-block;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px 30px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 600;
            margin: 10px 5px;
            transition: transform 0.2s;
        }
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(0,0,0,0.2);
        }
        .btn-secondary {
            background: #6c757d;
        }
        .install-cmd {
            background: #f8f9fa;
            border: 1px solid #dee2e6;
            border-radius: 8px;
            padding: 15px;
            margin: 20px 0;
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
        }
        .info {
            color: #666;
            font-size: 0.9em;
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid #eee;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🐾 PixelPaw</h1>
        <p class="subtitle">AI Agents as Pixel Art Characters</p>
        
        <p>Visualize your AI coding agents as animated pixel characters in a virtual office.</p>
        
        <div style="margin: 30px 0;">
            <a href="/pixelpaw.vsix" download class="btn">
                ⬇️ Download Extension (.vsix)
            </a>
            <a href="/docs/" class="btn btn-secondary">
                📚 Documentation
            </a>
        </div>
        
        <div class="install-cmd">
            <strong>Install Command:</strong><br>
            code --install-extension pixelpaw.vsix
        </div>
        
        <div class="info">
            <strong>Requirements:</strong><br>
            • VS Code 1.85.0 or later<br>
            • Claude Code CLI (optional, for full features)<br>
            <br>
            <strong>Connects to:</strong> daveai.tech API for chat and voice synthesis
        </div>
    </div>
</body>
</html>
EOF

echo "✓ Build complete!"
echo "✓ Extension available at: http://localhost:8085/pixelpaw.vsix"
echo "✓ Download page: http://localhost:8085/"
echo ""
echo "Starting HTTP server..."

# Start server
exec serve /app/public -p 8085 --no-clipboard
