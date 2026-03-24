#!/usr/bin/env python3
import re, shutil, os, time

def patch_file(filepath):
    backup = f"{filepath}.bak.{int(time.time())}"
    shutil.copy2(filepath, backup)
    
    with open(filepath, 'r') as f:
        code = f.read()
    
    if '_get_llm_content' in code:
        print(f"  {os.path.basename(filepath)}: already patched")
        return
    
    # Add helper function after imports
    helper = (
        '\ndef _get_llm_content(msg):\n'
        '    """Extract content handling reasoning models (GLM-4.7-flash etc)."""\n'
        '    if isinstance(msg, dict):\n'
        '        return msg.get("content") or msg.get("reasoning_content") or ""\n'
        '    c = getattr(msg, "content", None) or ""\n'
        '    if not c:\n'
        '        c = getattr(msg, "reasoning_content", None) or ""\n'
        '    return c\n\n'
    )
    
    # Find end of import block
    lines = code.split('\n')
    insert_at = 0
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith('import ') or stripped.startswith('from '):
            insert_at = i + 1
        elif insert_at > 0 and stripped and not stripped.startswith('#'):
            break
    
    lines.insert(insert_at, helper)
    code = '\n'.join(lines)
    
    with open(filepath, 'w') as f:
        f.write(code)
    print(f"  {os.path.basename(filepath)}: patched with _get_llm_content()")

for f in ['brain_llm.py', 'brain_api.py']:
    path = f'/opt/agent-brain/{f}'
    if os.path.exists(path):
        patch_file(path)
    else:
        print(f"  {f}: not found, skipping")
