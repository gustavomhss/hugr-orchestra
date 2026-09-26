#!/usr/bin/env python3
"""Generate an email-safe table signature with escaped, owner-supplied content."""
import argparse
from html import escape
from pathlib import Path
from urllib.parse import urlparse
p = argparse.ArgumentParser(description=__doc__)
p.add_argument("--name", required=True)
p.add_argument("--role", default="")
p.add_argument("--email", required=True)
p.add_argument("--logo-url", required=True, help="Public HTTPS URL of hugr-horizontal-primary-512w.png")
p.add_argument("--website", default="")
p.add_argument("--output", type=Path, default=Path("signature.html"))
a = p.parse_args()
for label, url in (("logo-url",a.logo_url),("website",a.website)):
    if url and (urlparse(url).scheme != "https" or not urlparse(url).netloc): p.error(label+" must be an absolute HTTPS URL")
if "@" not in a.email or any(c in a.email for c in "\r\n<>"): p.error("Invalid email")
if a.output.exists(): p.error("Output already exists; choose another filename")
link = f'<a href="{escape(a.website,quote=True)}" style="color:#1266F6;text-decoration:none">{escape(urlparse(a.website).netloc)}</a>' if a.website else ""
html = f'''<!doctype html><html><meta charset="utf-8"><body><table role="presentation" cellpadding="0" cellspacing="0" style="font-family:Arial,sans-serif;color:#0B1423"><tr><td style="padding-right:20px;border-right:2px solid #1266F6"><img src="{escape(a.logo_url,quote=True)}" alt="HuGR — Human Guardrail" width="230" height="65" style="display:block;border:0"></td><td style="padding-left:20px"><strong style="font-size:16px">{escape(a.name)}</strong><br><span style="font-size:13px;color:#52647B">{escape(a.role)}</span><br><br><a href="mailto:{escape(a.email,quote=True)}" style="font-size:13px;color:#1266F6;text-decoration:none">{escape(a.email)}</a><br><span style="font-size:13px">{link}</span></td></tr></table></body></html>'''
a.output.write_text(html,encoding="utf-8")
print(a.output.resolve())
