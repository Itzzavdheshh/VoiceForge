import urllib.request
import json
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

req = urllib.request.Request(
    'https://api.github.com/repos/itzzavdhesh/VoiceForge/issues?state=all&per_page=100',
    headers={'User-Agent': 'Mozilla/5.0'}
)
res = urllib.request.urlopen(req, context=ctx)
data = json.loads(res.read())
issues = [i for i in data if 'pull_request' not in i]
for i in issues:
    print(f"{i['state'].upper()}: {i['title']}")
