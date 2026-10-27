import json, gzip, base64, re

with open('Voyage_Ops_Prototype.html', 'r', encoding='utf-8') as f:
    content = f.read()

m_manifest = re.search(r'<script type="__bundler/manifest">\s*(\{.*?\})\s*</script>', content, re.DOTALL)
with open('scratch/unpack_results.txt', 'w', encoding='utf-8') as out_f:
    if m_manifest:
        manifest = json.loads(m_manifest.group(1))
        for k, v in manifest.items():
            data = base64.b64decode(v['data'])
            if v.get('compressed'):
                try:
                    data = gzip.decompress(data)
                except:
                    pass
            text = ''
            try:
                text = data.decode('utf-8', errors='ignore')
            except:
                pass
            if 'function Timeline' in text:
                out_f.write(f"Asset {k} has Timeline!\n")
                pos = text.find('function Timeline')
                out_f.write(text[pos:pos+600] + "\n\n")
            if 'agents:' in text or 'Orchestrator' in text:
                pos = text.find('Orchestrator')
                out_f.write(f"Asset {k} has Orchestrator at {pos}:\n")
                out_f.write(text[max(0, pos-100):min(len(text), pos+300)] + "\n\n")

