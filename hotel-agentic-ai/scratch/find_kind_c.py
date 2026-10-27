import json, gzip, base64, re

with open('Voyage_Ops_Prototype.html', 'r', encoding='utf-8') as f:
    content = f.read()

m_manifest = re.search(r'<script type="__bundler/manifest">\s*(\{.*?\})\s*</script>', content, re.DOTALL)
manifest = json.loads(m_manifest.group(1))

with open('scratch/kind_c_search.txt', 'w', encoding='utf-8') as out:
    for k, v in manifest.items():
        data = base64.b64decode(v['data'])
        if v.get('compressed'):
            try:
                data = gzip.decompress(data)
            except:
                pass
        text = data.decode('utf-8', errors='ignore')
        if 'KIND_C' in text:
            out.write(f"In asset {k}:\n")
            pos = text.find('KIND_C')
            out.write(text[max(0, pos-50):pos+300] + '\n\n')
