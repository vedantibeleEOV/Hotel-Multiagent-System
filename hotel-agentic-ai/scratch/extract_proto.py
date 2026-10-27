import json
import gzip
import base64
import re

with open('Voyage_Ops_Prototype.html', 'r', encoding='utf-8') as f:
    content = f.read()

m_manifest = re.search(r'<script type="__bundler/manifest">\s*(\{.*?\})\s*</script>', content, re.DOTALL)
m_order = re.search(r'<script type="__bundler/page_order">\s*(\[.*?\])\s*</script>', content, re.DOTALL)
m_template = re.search(r'<script type="__bundler/template">\s*("(?:\\.|[^"\\])*")\s*</script>', content, re.DOTALL)

print('Manifest found:', bool(m_manifest))
print('Page order found:', bool(m_order))
print('Template found:', bool(m_template))

if m_manifest:
    manifest = json.loads(m_manifest.group(1))
    print('Manifest asset count:', len(manifest))
    for k, v in manifest.items():
        data = base64.b64decode(v['data'])
        if v.get('compressed'):
            try:
                data = gzip.decompress(data)
            except Exception as e:
                print(f"Decompress error for {k}: {e}")
        text = ''
        try:
            text = data.decode('utf-8', errors='ignore')
        except:
            pass
        if 'AI Operations' in text or 'Simulate checkout' in text:
            print(f'Match found in {k}! Size: {len(text)}')
            with open(f'scratch/proto_ai_ops_{k}.html', 'w', encoding='utf-8') as out:
                out.write(text)

if m_template:
    tpl = json.loads(m_template.group(1))
    if 'AI Operations' in tpl or 'Simulate checkout' in tpl:
        print('Match found in template!')
        with open('scratch/proto_template.html', 'w', encoding='utf-8') as out:
            out.write(tpl)
