"""
Cryptographic Credential Protection Subsystem
Supports:
1. AES-256-GCM (Authenticated Encryption with Associated Data, 256-bit key, 96-bit IV)
2. Fernet specification (AES-128-CBC with HMAC-SHA256 and PKCS7 padding) for backward compatibility
"""
import base64
import os
import json
from typing import Dict, Any, Optional
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.fernet import Fernet
from app.core.config import BASE_DIR

_KEY_DIR = BASE_DIR / "data"
_SECRET_KEY_FILE = _KEY_DIR / ".secret_key"
_GCM_PREFIX = "aes256gcm:"

def _get_or_create_master_key() -> bytes:
    """
    Retrieve or initialize the persistent 256-bit master cryptographic key.
    Checks environment variable AEGISSTOR_MASTER_KEY or SECRET_KEY first for cloud deployments (e.g. Render),
    falling back to local persistent sovereign key file.
    """
    env_key = os.environ.get("AEGISSTOR_MASTER_KEY") or os.environ.get("SECRET_KEY")
    if env_key:
        encoded = env_key.strip().encode("utf-8")
        if len(encoded) in (32, 44):
            return encoded
        import hashlib
        return base64.urlsafe_b64encode(hashlib.sha256(encoded).digest())

    _KEY_DIR.mkdir(parents=True, exist_ok=True)
    if _SECRET_KEY_FILE.exists():
        with open(_SECRET_KEY_FILE, "rb") as f:
            key_data = f.read().strip()
            # If standard Fernet key (44 chars urlsafe base64 of 32 bytes), return it
            if len(key_data) == 44 or len(key_data) == 32:
                return key_data
    
    # Generate 32 cryptographically random bytes (256-bit key)
    raw_key = os.urandom(32)
    fernet_key = base64.urlsafe_b64encode(raw_key)
    with open(_SECRET_KEY_FILE, "wb") as f:
        f.write(fernet_key)
    return fernet_key

def _get_raw_256bit_key() -> bytes:
    master = _get_or_create_master_key()
    try:
        raw = base64.urlsafe_b64decode(master)
        if len(raw) == 32:
            return raw
    except Exception:
        pass
    import hashlib
    return hashlib.sha256(master).digest()

def encrypt_credential(plain_text: str) -> str:
    """
    Encrypt sensitive string (e.g., database password) using AES-256-GCM.
    Returns prefix-tagged base64 ciphertext containing a 96-bit nonce and 128-bit authentication tag.
    """
    if not plain_text:
        return ""
    key = _get_raw_256bit_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)  # 96-bit nonce
    ciphertext = aesgcm.encrypt(nonce, plain_text.encode("utf-8"), None)
    payload = nonce + ciphertext
    b64 = base64.urlsafe_b64encode(payload).decode("utf-8")
    return f"{_GCM_PREFIX}{b64}"

def decrypt_credential(cipher_text: str) -> str:
    """
    Decrypt sensitive credential back to plain string.
    Supports both modern AES-256-GCM and legacy Fernet (AES-128-CBC + HMAC-SHA256).
    """
    if not cipher_text:
        return ""
    
    # Modern AES-256-GCM
    if cipher_text.startswith(_GCM_PREFIX):
        try:
            b64_part = cipher_text[len(_GCM_PREFIX):]
            payload = base64.urlsafe_b64decode(b64_part.encode("utf-8"))
            nonce = payload[:12]
            ciphertext = payload[12:]
            key = _get_raw_256bit_key()
            aesgcm = AESGCM(key)
            decrypted = aesgcm.decrypt(nonce, ciphertext, None)
            return decrypted.decode("utf-8")
        except Exception as e:
            # Mask error detail in production to prevent padding/oracle leakage
            return ""

    # Legacy Fernet (AES-128-CBC + HMAC-SHA256) fallback
    try:
        master_key = _get_or_create_master_key()
        f = Fernet(master_key)
        decrypted = f.decrypt(cipher_text.encode("utf-8"))
        return decrypted.decode("utf-8")
    except Exception:
        return ""

def rotate_credential(cipher_text: str, old_master_key: bytes, new_master_key: bytes) -> str:
    """
    Re-encrypt credential under a new master cryptographic key during key rotation.
    """
    if not cipher_text:
        return ""
    # Decrypt under old key
    plain = ""
    if cipher_text.startswith(_GCM_PREFIX):
        b64_part = cipher_text[len(_GCM_PREFIX):]
        payload = base64.urlsafe_b64decode(b64_part.encode("utf-8"))
        nonce = payload[:12]
        ciphertext = payload[12:]
        raw_old = base64.urlsafe_b64decode(old_master_key) if len(old_master_key) == 44 else old_master_key
        aesgcm = AESGCM(raw_old)
        plain = aesgcm.decrypt(nonce, ciphertext, None).decode("utf-8")
    else:
        f = Fernet(old_master_key)
        plain = f.decrypt(cipher_text.encode("utf-8")).decode("utf-8")

    # Encrypt under new key
    raw_new = base64.urlsafe_b64decode(new_master_key) if len(new_master_key) == 44 else new_master_key
    aesgcm_new = AESGCM(raw_new)
    new_nonce = os.urandom(12)
    new_cipher = aesgcm_new.encrypt(new_nonce, plain.encode("utf-8"), None)
    return f"{_GCM_PREFIX}{base64.urlsafe_b64encode(new_nonce + new_cipher).decode('utf-8')}"

def get_crypto_specifications() -> Dict[str, Any]:
    """
    Return exact, verified technical specifications of active cryptographic implementations.
    """
    return {
        "primary_cipher": "AES-256-GCM (Galois/Counter Mode)",
        "primary_key_size_bits": 256,
        "primary_nonce_size_bits": 96,
        "primary_auth_tag_size_bits": 128,
        "legacy_cipher_fallback": "Fernet (AES-128-CBC with PKCS7 padding and HMAC-SHA256)",
        "legacy_key_composition": "128-bit AES encryption key + 128-bit HMAC-SHA256 authentication key",
        "key_storage": "Local sovereign file at data/.secret_key",
        "key_rotation_supported": True,
        "tls_recommended": "TLS 1.3 for any networked deployment",
        "passwords_hashing": "Argon2id (time_cost=2, memory_cost=65536 KiB, parallelism=4)"
    }
