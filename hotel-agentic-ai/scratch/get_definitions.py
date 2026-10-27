import json, gzip, base64, re

with open('Voyage_Ops_Prototype.html', 'r', encoding='utf-8') as f:
    content = f.read()

m_manifest = re.search(r'<script type="__bundler/manifest">\s*(\{.*?\})\s*</script>', content, re.DOTALL)
manifest = json.loads(m_manifest.group(1))

def get_text(uuid):
    data = base64.b64decode(manifest[uuid]['data'])
    if manifest[uuid].get('compressed'):
        data = gzip.decompress(data)
    return data.decode('utf-8', errors='ignore')

t_state = get_text('bc2cb499-c29c-444d-8bdc-dc018f745ba2')
pos = t_state.find('S.agents={')
with open('scratch/agents_definition.txt', 'w', encoding='utf-8') as f:
    f.write(t_state[pos:pos+2000])

t_comp = get_text('d60fa53d-8825-4b49-bd1b-ae3c84a67dd5')
pos2 = t_comp.find('function Timeline')
with open('scratch/timeline_definition.txt', 'w', encoding='utf-8') as f:
    f.write(t_comp[pos2:pos2+2000])
