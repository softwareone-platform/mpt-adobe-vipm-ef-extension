from adobe.client import AdobeClient, get_adobe_client, reset_adobe_client
from adobe.resources.customer import CustomerClient
from adobe.transport import AdobeTransport


def test_adobe_client_composes_transport_and_customer(adobe_env):
    client = AdobeClient()  # act

    assert isinstance(client._transport, AdobeTransport)
    assert isinstance(client.customer, CustomerClient)
    assert client.customer._transport is client._transport


def test_get_adobe_client_returns_singleton(adobe_env):
    assert get_adobe_client() is get_adobe_client()  # act


def test_get_adobe_client_returns_new_instance_after_reset(adobe_env):
    client1 = get_adobe_client()

    reset_adobe_client()  # act

    assert client1 is not get_adobe_client()
