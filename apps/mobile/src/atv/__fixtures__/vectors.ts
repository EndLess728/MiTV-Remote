/**
 * Fixtures generated with androidtvremote2 (the Python library Home Assistant uses) and its
 * protobuf definitions, so these tests check against a known-working implementation.
 */

// Two self-signed certificates from androidtvremote2's certificate_generator, and the pairing
// code / secret its pairing.py computes for them.
export const CLIENT_CERT =
  'MIICxDCCAaygAwIBAgICA+gwDQYJKoZIhvcNAQELBQAwETEPMA0GA1UEAwwGY2xpZW50MB4XDTI2MTAyMDAxNTIyNloXDTM2MTAxNzAxNTIyNlowETEPMA0GA1UEAwwGY2xpZW50MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwI5zpLK19vU172TlpQeRzqPtI6vS+aAbmrvjyKzHwN6iJYSGd3YP5mKnIvRWz4MO4YVgFQUQTG+gxB7OxTIeKjjyZBwTFMgD0n8pc7QCokAU9YxeQOqfJtiaVVO8G0D0a9p7hyd51iJ3J8Cn01QiY/R9Vu5EtfuzAw8BSr2buGI0cJpLGgskg+2yxysuo/GUCPWhoBjdj/Fi6+HJ0GsIrx40bAbfxfpmKtswO7ePPz93rYA99VamcUc771RgrYEuF2yenpdHKICxHOtvVzoOjNGC6E5vWohG1Fj3csvk7ON9m8OVdfoqyJPU9K7TUNiFGnlfo1bc9z5PfubYoZr1EwIDAQABoyYwJDAPBgNVHRMECDAGAQH/AgEAMBEGA1UdEQQKMAiCBmNsaWVudDANBgkqhkiG9w0BAQsFAAOCAQEAajHqzHW5Ujyw4CyXVhyK/G4k4w0o8QhIox/w5B1wnw1rcAt+/F4GHS2aQ11h1/gJtsC+YaqcbelxVvSSCqhvLDX7CWe8xoPCDX65HufvFNLQQEEUlJxkyegBe6n4tT22xJdTn6zTD65vYRZfSjKuvGXzpjRKZZFHSKd6aSGLtpqhVPqcR2Z/3YB9Su1VqEI/F2SWBCSejZUUD9f8X1f+aLPM6A77tOm5kz5M0CMFsIA+MqqTJn9cz+jbdkFKYkiWtBMAiGi+v9uVPdypQyHq88f7gfzBEVMko3I9/XPgUd353cKXUTei986incGaWHp7NAotNKE9yMEDIxxv5b3CwA==';
export const SERVER_CERT =
  'MIICuDCCAaCgAwIBAgICA+gwDQYJKoZIhvcNAQELBQAwDTELMAkGA1UEAwwCdHYwHhcNMjYxMDIwMDE1MjI2WhcNMzYxMDE3MDE1MjI2WjANMQswCQYDVQQDDAJ0djCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAKOqS1k8/QaU27Ah/BkgYO6xR0qM2tI1HbzsrPe/YEQHjT95yqYUcgVgQ74wPqUshrj4GoSfF4u9IF7iqMaYKv5sc/fVQhmR0ej8AJQa7OYWchzgP/fFl2I/A+/6epG7A+IwgMPwb+PEMdvZNsY6XuyqUEKg/AL8b/2/xXjCGCSG2vC1cuOTyBFwGmrSM9girl7ISea9kRx3KlF9oXG0ekUI7OZRPwkTRJTfkyk4oygYhR4KVW+eAc23Q9TIw1TyxHU8sz3v6wWlAC6WHXBESvOb+/bCdxXjZZiEUL0bGM9YfZFpLn/rKGDR/sX2B8EO5qd9XSn9FyJ/DCEyaZoYdDcCAwEAAaMiMCAwDwYDVR0TBAgwBgEB/wIBADANBgNVHREEBjAEggJ0djANBgkqhkiG9w0BAQsFAAOCAQEAX4P/t/4WtUhbiUXfnMrnTilNrvensSm5jxV95gMAbsF+8y/ikhkhdjb11gfs++68eBvpkOBnk7yeizK9W84QpKEUbMpcBTTbeBlf5RaPpsMGtYpaabAVKMe3VVFld+06oZj8QTEWYRC5FNEndvAYc9epHnRYQiT/lZBKbLFGRYaWzRefvVgr4lEPpzq44Q8vr1T8bakJXZM4FoGpjg+f+7X1uOIAIFVXpKbhOg9k1ZuKppSI8NZiaRM+3BXfJ1ek0ANG5V3q3VpmczXH7KrVgrbZJrrlUfgJf2V2eFee3aieiqeayWkn/dbslsZpLOZvEwuO531yglPfcziup268Dg==';
export const PAIRING_CODE = 'AA3F9A';
export const PAIRING_SECRET_HEX =
  'aa7fdc8dfcff4b9ddd943c85edcd6ba1469fe9795d6029fe03f55ede331c8ecc';

// Serialized with polo_pb2 / remotemessage_pb2.
export const PB = {
  pairingRequest: [
    8, 2, 16, 200, 1, 82, 22, 10, 9, 97, 116, 118, 114, 101, 109, 111, 116, 101, 18, 9, 77, 105, 32,
    82, 101, 109, 111, 116, 101,
  ],
  pairingOptions: [8, 2, 16, 200, 1, 162, 1, 8, 10, 4, 8, 3, 16, 6, 24, 1],
  pairingConfiguration: [8, 2, 16, 200, 1, 242, 1, 8, 10, 4, 8, 3, 16, 6, 16, 1],
  pairingSecret0to31: [
    8, 2, 16, 200, 1, 194, 2, 34, 10, 32, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31,
  ],
  keyDpadUpShort: [82, 4, 8, 19, 16, 3],
  pingResponseMinus5: [74, 11, 8, 251, 255, 255, 255, 255, 255, 255, 255, 255, 1],
  setActive615: [18, 3, 8, 231, 4],
  imeHello: [
    170, 1, 22, 8, 3, 16, 7, 26, 16, 8, 1, 18, 12, 8, 4, 16, 4, 26, 6, 104, 195, 169, 108, 108, 111,
  ],
  configure615: [
    10, 50, 8, 231, 4, 18, 45, 10, 9, 77, 105, 32, 82, 101, 109, 111, 116, 101, 18, 9, 77, 105, 32,
    82, 101, 109, 111, 116, 101, 24, 1, 34, 1, 49, 42, 9, 97, 116, 118, 114, 101, 109, 111, 116,
    101, 50, 5, 49, 46, 48, 46, 48,
  ],
  inPing12345: [66, 5, 8, 185, 96, 16, 1],
  inConfigure: [
    10, 25, 8, 255, 4, 18, 20, 10, 10, 77, 105, 84, 86, 45, 77, 79, 79, 82, 50, 18, 6, 88, 105, 97,
    111, 109, 105,
  ],
  inStart: [194, 2, 2, 8, 1],
  inVolume: [146, 3, 4, 48, 100, 56, 12],
  inImeBatch: [170, 1, 4, 8, 9, 16, 2],
  inImeKey: [162, 1, 15, 10, 13, 98, 11, 99, 111, 109, 46, 110, 101, 116, 102, 108, 105, 120],
  inRequestAck: [8, 2, 16, 200, 1, 90, 4, 10, 2, 116, 118],
  inConfigurationAck: [8, 2, 16, 200, 1, 250, 1, 0],
  inBadSecret: [8, 2, 16, 146, 3],
};
