import re

with open('artifacts/chalet-marketplace/src/pages/Admin.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

start_idx = content.find('function OwnersTab')
end_idx = content.find('/* ── Services Tab ─────────────────────────────── */', start_idx)

if start_idx != -1 and end_idx != -1:
    with open('/tmp/new_owners.tsx', 'r', encoding='utf-8') as f2:
        new_tab = f2.read()
    
    new_content = content[:start_idx] + new_tab + '\n' + content[end_idx:]
    with open('artifacts/chalet-marketplace/src/pages/Admin.tsx', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Successfully replaced OwnersTab")
else:
    print("Could not find boundaries")
