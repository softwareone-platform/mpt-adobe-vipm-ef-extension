from mpt_adobe_vipm_ef.models.product import ProductSegment


def test_product_segment_id_and_segment(product_id, segment):
    result = ProductSegment(id=product_id, segment=segment)

    assert result.id == product_id
    assert result.segment == segment


def test_product_segment_uses_field_names(product_id, segment):
    product_segment = ProductSegment(id=product_id, segment=segment)

    result = product_segment.to_dict()

    assert result == {"id": product_id, "segment": segment}


def test_product_segment_from_payload(product_id, segment):
    payload = {"id": product_id, "segment": segment}

    result = ProductSegment.from_payload(payload)

    assert result == ProductSegment(id=product_id, segment=segment)
