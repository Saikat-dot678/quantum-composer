"""Tests for the protocol-level quantum cryptography simulators."""

from fastapi.testclient import TestClient

from crypto import privacy_amplify, simulate_bb84
from main import app

client = TestClient(app)


def test_bb84_low_qber_without_eve():
    response = client.post(
        "/crypto/bb84/simulate",
        json={"num_bits": 512, "eve_enabled": False, "channel_error_rate": 0.02, "seed": 1},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["qber"] < 0.11
    assert body["eve_detected"] is False
    assert body["sifted_key_length"] > 0


def test_bb84_eve_raises_qber_above_no_eve():
    common = {"num_bits": 512, "channel_error_rate": 0.02, "seed": 1}
    no_eve = client.post(
        "/crypto/bb84/simulate", json={**common, "eve_enabled": False}
    ).json()
    with_eve = client.post(
        "/crypto/bb84/simulate", json={**common, "eve_enabled": True}
    ).json()
    assert with_eve["qber"] > no_eve["qber"]
    assert with_eve["qber"] > 0.15  # intercept-resend approaches ~25%
    assert with_eve["eve_detected"] is True


def test_bb84_is_deterministic_with_seed():
    payload = {"num_bits": 128, "eve_enabled": True, "channel_error_rate": 0.01, "seed": 42}
    first = client.post("/crypto/bb84/simulate", json=payload).json()
    second = client.post("/crypto/bb84/simulate", json=payload).json()
    assert first["sifted_key_alice"] == second["sifted_key_alice"]
    assert first["qber"] == second["qber"]


def test_e91_chsh_drops_and_qber_rises_with_eve():
    no_eve = client.post(
        "/crypto/e91/simulate",
        json={"num_pairs": 2000, "eve_enabled": False, "channel_error_rate": 0.0, "seed": 3},
    ).json()
    with_eve = client.post(
        "/crypto/e91/simulate",
        json={"num_pairs": 2000, "eve_enabled": True, "channel_error_rate": 0.0, "seed": 3},
    ).json()
    assert no_eve["chsh_violation"] is True
    assert no_eve["chsh_s"] > 2.0
    assert with_eve["chsh_s"] < no_eve["chsh_s"]
    assert with_eve["qber"] > no_eve["qber"]


def test_b92_produces_conclusive_key():
    response = client.post(
        "/crypto/b92/simulate",
        json={"num_bits": 1000, "channel_error_rate": 0.01, "seed": 5},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["sifted_key_length"] > 0
    assert body["conclusive_count"] + body["inconclusive_count"] == 1000
    assert body["qber"] < 0.11


def test_qrng_returns_balanced_bits():
    response = client.post(
        "/crypto/qrng/simulate", json={"num_bits": 4000, "seed": 7}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["zero_count"] + body["one_count"] == 4000
    assert 0.45 < body["frequency_1"] < 0.55  # roughly balanced


def test_crypto_rejects_invalid_inputs():
    assert client.post("/crypto/bb84/simulate", json={"num_bits": 0}).status_code == 422
    assert (
        client.post(
            "/crypto/bb84/simulate", json={"num_bits": 100, "channel_error_rate": 2.0}
        ).status_code
        == 422
    )
    assert (
        client.post("/crypto/qrng/simulate", json={"num_bits": 100000}).status_code == 422
    )


def test_privacy_amplification_shrinks_key():
    key = [i % 2 for i in range(200)]
    result = privacy_amplify(key, qber=0.03, seed=1)
    assert 0 < result["output_length"] < len(key)
    assert len(result["final_key"]) == result["output_length"]


def test_bb84_high_error_yields_no_secure_key():
    # A very noisy / eavesdropped channel should distil no secure key.
    body = simulate_bb84(num_bits=400, eve_enabled=True, channel_error_rate=0.2, seed=2)
    assert body["final_key_length"] == 0


def test_bb84_copy_does_not_claim_error_reconciliation():
    body = simulate_bb84(num_bits=256, eve_enabled=False, channel_error_rate=0.02, seed=12)
    assert "does not implement" in body["explanation"]
    assert "not a proven shared final key" in body["explanation"]
    assert "does not perform error reconciliation" in body["privacy_amplification"]["explanation"]


def test_protocol_explanations_preserve_educational_boundaries():
    b92 = client.post(
        "/crypto/b92/simulate",
        json={"num_bits": 256, "channel_error_rate": 0.2, "seed": 4},
    ).json()
    assert "not itself a monotonic noise indicator" in b92["explanation"]
    assert "lowers the conclusive rate" not in b92["explanation"]

    e91 = client.post(
        "/crypto/e91/simulate",
        json={"num_pairs": 512, "eve_enabled": False, "seed": 4},
    ).json()
    assert "software-model indicator" in e91["explanation"]
    assert "certifies genuine entanglement" not in e91["explanation"]
