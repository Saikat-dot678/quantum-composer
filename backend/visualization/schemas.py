"""Typed response models for backend-generated visualizations."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class CircuitDiagramPayload(BaseModel):
    """A validated, base64-transported SVG generated from a Qiskit circuit."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    format: Literal["svg"] = "svg"
    encoding: Literal["base64"] = "base64"
    content: str = Field(min_length=16, max_length=8_000_000)
    width: int = Field(ge=1, le=8_192)
    height: int = Field(ge=1, le=8_192)
    fold: int = Field(ge=-1, le=128)
    wrapped: bool = False

