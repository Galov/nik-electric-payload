# Ibis Product Sync

`Nik -> Ibis` webhook за продукти.

Текущ първи обхват:

- `product.created`
- `product.price_stock_updated`

Endpoint:

`POST https://new.ibis-electronics.com/api/integrations/nik/products/price-sync`

Header:

- `x-webhook-secret: <IBIS_SYNC_WEBHOOK_SECRET>`

Използвани env променливи в `Nik`:

- `IBIS_SYNC_WEBHOOK_URL`
- `IBIS_SYNC_WEBHOOK_SECRET`

Текуща логика в `Nik`:

- при `create` на продукт:
  - праща `product.created`
- при `update` на продукт:
  - ако има промяна в `priceRetail`, `stockQty` или `images`
  - праща `product.price_stock_updated`

Забележки:

- базовата цена за `Ibis` идва от `Nik.priceRetail`
- `sourceId` се подава като:
  - `sourceId` от `Nik`, ако го има
  - иначе `miProductId`, ако го има
- ако липсват задължителни полета за payload-а, sync-ът се пропуска и се логва warning
- грешка от `Ibis` не блокира записването на продукта в `Nik`; само се логва error
