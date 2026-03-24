"""
brain.py -- DaveAI Brain v4 thin launcher.
Wires all 11 micro-modules and starts Uvicorn on port 8888.
"""
import uvicorn
from brain_api import app  # registers all routes + startup hook

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8888, reload=False,
                log_level="info", access_log=True)