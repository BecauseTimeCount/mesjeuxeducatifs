# -*- coding: utf-8 -*-
"""
Pipeline de génération des voix françaises pré-générées (TTS neuronal edge-tts).

- Scanne tous les fichiers corpus : src/content/corpus-common.json
  et src/games/*/corpus.json
- Génère public/audio/<id>.mp3 pour chaque entrée (id -> texte)
- Écrit public/audio/manifest.json : la liste des ids disponibles,
  consultée au runtime par le moteur audio (fallback Web Speech sinon)
- Cache : un clip n'est régénéré que si son texte/voix a changé
  (empreinte stockée dans scripts/.audio-cache/hashes.json)

Usage : python scripts/generate-audio.py [--only <prefixe-id>] [--force]
Voix   : denise (consignes, défaut) | eloise (mascotte) | henri
"""

import asyncio
import hashlib
import json
import re
import sys
from pathlib import Path

# Console Windows : forcer UTF-8 (sinon les accents/symboles plantent en cp1252)
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

try:
    import edge_tts
except ImportError:
    sys.exit("edge-tts manquant : pip install edge-tts")

ROOT = Path(__file__).resolve().parent.parent
AUDIO_DIR = ROOT / "public" / "audio"
CACHE_DIR = Path(__file__).resolve().parent / ".audio-cache"
HASH_FILE = CACHE_DIR / "hashes.json"

VOICES = {
    "denise": "fr-FR-DeniseNeural",
    "eloise": "fr-FR-EloiseNeural",
    "henri": "fr-FR-HenriNeural",
    "sonia": "en-GB-SoniaNeural",
}
DEFAULT_VOICE = "denise"
# Légèrement ralenti pour des enfants de 4-7 ans
DEFAULT_RATE = "-12%"

ID_RE = re.compile(r"^[a-z0-9][a-z0-9.\-]*$")


def collect_corpus():
    """Rassemble toutes les entrées de corpus, détecte les doublons d'id."""
    files = [ROOT / "src" / "content" / "corpus-common.json"]
    files += sorted((ROOT / "src" / "games").glob("*/corpus.json"))
    entries = {}
    for f in files:
        if not f.exists():
            continue
        data = json.loads(f.read_text(encoding="utf-8"))
        for e in data.get("entries", []):
            eid, text = e["id"], e["text"].strip()
            if not ID_RE.match(eid):
                sys.exit(f"Id de clip invalide '{eid}' dans {f} (attendu: [a-z0-9.-])")
            if eid in entries and entries[eid]["text"] != text:
                sys.exit(f"Id de clip dupliqué avec textes différents : '{eid}'")
            entries[eid] = {
                "text": text,
                "voice": e.get("voice", data.get("voice-default", DEFAULT_VOICE)),
                "rate": e.get("rate", DEFAULT_RATE),
            }
    return entries


async def synth(eid, spec, sem):
    async with sem:
        voice = VOICES.get(spec["voice"], VOICES[DEFAULT_VOICE])
        out = AUDIO_DIR / f"{eid}.mp3"
        communicate = edge_tts.Communicate(spec["text"], voice, rate=spec["rate"])
        await communicate.save(str(out))
        print(f"  ✓ {eid}  ({spec['voice']})  « {spec['text'][:60]} »")


async def main():
    only = None
    force = "--force" in sys.argv
    if "--only" in sys.argv:
        only = sys.argv[sys.argv.index("--only") + 1]

    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    old_hashes = json.loads(HASH_FILE.read_text()) if HASH_FILE.exists() else {}

    entries = collect_corpus()
    print(f"{len(entries)} clips dans le corpus")

    todo = {}
    new_hashes = {}
    for eid, spec in entries.items():
        h = hashlib.sha1(
            f"{spec['text']}|{spec['voice']}|{spec['rate']}".encode()
        ).hexdigest()
        new_hashes[eid] = h
        out = AUDIO_DIR / f"{eid}.mp3"
        if only and not eid.startswith(only):
            continue
        if force or old_hashes.get(eid) != h or not out.exists():
            todo[eid] = spec

    print(f"{len(todo)} clips à générer (cache : {len(entries) - len(todo)} à jour)")
    sem = asyncio.Semaphore(8)
    results = await asyncio.gather(
        *(synth(eid, spec, sem) for eid, spec in todo.items()),
        return_exceptions=True,
    )
    failed = [
        eid
        for eid, r in zip(todo.keys(), results)
        if isinstance(r, Exception)
    ]
    for eid in failed:
        print(f"  ✗ ÉCHEC {eid}", file=sys.stderr)
        new_hashes.pop(eid, None)
        (AUDIO_DIR / f"{eid}.mp3").unlink(missing_ok=True)

    # Manifest = uniquement les clips réellement présents sur le disque
    available = sorted(
        p.stem for p in AUDIO_DIR.glob("*.mp3") if p.stem in entries
    )
    (AUDIO_DIR / "manifest.json").write_text(
        json.dumps({"ids": available}, ensure_ascii=False, indent=0),
        encoding="utf-8",
    )
    HASH_FILE.write_text(json.dumps(new_hashes, indent=0), encoding="utf-8")
    print(f"manifest.json : {len(available)} clips disponibles")
    if failed:
        sys.exit(f"{len(failed)} clips en échec — relancer le script")


if __name__ == "__main__":
    asyncio.run(main())
