"""Quick ElevenLabs API diagnostic — run with: python test_elevenlabs.py"""
import asyncio
import httpx
from config.settings import get_settings

async def main():
    s = get_settings()
    print(f"API key : {s.elevenlabs_api_key[:8]}…")
    print(f"Voice ID: {s.elevenlabs_voice_id}")
    print(f"Model   : {s.elevenlabs_model_id}")
    print()

    headers = {"xi-api-key": s.elevenlabs_api_key}

    async with httpx.AsyncClient(timeout=15) as client:
        # 1. Check subscription / credits
        r = await client.get("https://api.elevenlabs.io/v1/user/subscription", headers=headers)
        print(f"[subscription] status={r.status_code}")
        if r.status_code == 200:
            data = r.json()
            print(f"  tier            : {data.get('tier')}")
            print(f"  char_count      : {data.get('character_count')}")
            print(f"  char_limit      : {data.get('character_limit')}")
            remaining = (data.get('character_limit') or 0) - (data.get('character_count') or 0)
            print(f"  remaining chars : {remaining}")
        else:
            print(f"  body: {r.text[:300]}")
        print()

        # 2. Check voice exists
        r = await client.get(f"https://api.elevenlabs.io/v1/voices/{s.elevenlabs_voice_id}", headers=headers)
        print(f"[voice check] status={r.status_code}")
        if r.status_code == 200:
            print(f"  voice name: {r.json().get('name')}")
        else:
            print(f"  body: {r.text[:300]}")
        print()

        # 3. Try a short TTS synthesis
        payload = {
            "text": "Hello test.",
            "model_id": s.elevenlabs_model_id,
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
        }
        r = await client.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{s.elevenlabs_voice_id}",
            headers={**headers, "Content-Type": "application/json"},
            json=payload,
        )
        print(f"[tts synthesis] status={r.status_code}")
        if r.status_code == 200:
            print(f"  SUCCESS — received {len(r.content)} bytes of audio")
        else:
            print(f"  FAILED — body: {r.text[:500]}")

asyncio.run(main())
