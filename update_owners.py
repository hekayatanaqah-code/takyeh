import re

with open('artifacts/chalet-marketplace/src/pages/Admin.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# find function OwnersTab
start_idx = content.find('function OwnersTab')
end_idx = content.find('/* ── Services Tab ─────────────────────────────── */', start_idx)

if start_idx != -1 and end_idx != -1:
    with open('/tmp/old_owners.tsx', 'w', encoding='utf-8') as f:
        f.write(content[start_idx:end_idx])
    print("Found and extracted old OwnersTab")
else:
    print("Could not find boundaries")
