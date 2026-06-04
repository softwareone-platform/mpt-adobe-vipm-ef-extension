from mpt_adobe_vipm_ef.models import ProductSegment


def test_product_segment_id_and_segment():
    result = ProductSegment(id="PRD-6095-3767", segment="COM")

    assert result.id == "PRD-6095-3767"
    assert result.segment == "COM"


def test_product_segment_uses_field_names():
    segment = ProductSegment(id="PRD-6095-3767", segment="COM")

    result = segment.to_dict()

    assert result == {"id": "PRD-6095-3767", "segment": "COM"}


def test_product_segment_from_payload():
    payload = {"id": "PRD-6095-3767", "segment": "COM"}

    result = ProductSegment.from_payload(payload)

    assert result == ProductSegment(id="PRD-6095-3767", segment="COM")
