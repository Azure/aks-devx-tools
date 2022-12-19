import {KnownContainerRegistryAudience} from '@azure/container-registry';
import {
   getPagedAsyncIterator,
   PagedResult,
   PageSettings
} from '@azure/core-paging';
import * as assert from 'assert';
import {audienceFromLocation, listAll} from '../../../utils/az';

suite('Az Utility Test Suite', () => {
   test('it lists all from an iterator', async () => {
      const n = 100;
      const collection = Array.from(Array(n), (_, i) => i + 1);

      // create iterator that returns collection
      const pagedResult: PagedResult<number[], PageSettings, number> = {
         firstPageLink: 0,
         async getPage(pageLink, maxPageSize) {
            const top = maxPageSize || 5;
            if (pageLink < collection.length) {
               return Promise.resolve({
                  page: collection.slice(
                     pageLink,
                     Math.min(pageLink + top, collection.length)
                  ),
                  nextPageLink:
                     top < collection.length - pageLink
                        ? pageLink + top
                        : undefined
               });
            } else {
               throw new Error('should not get here');
            }
         }
      };
      const iterator = getPagedAsyncIterator(pagedResult);

      const returned = await listAll(iterator);
      assert.deepStrictEqual(returned, collection);
      assert.strictEqual(returned.length, n);
   });

   test('it returns audience from a location', async () => {
      assert.strictEqual(
         audienceFromLocation('eastus'),
         KnownContainerRegistryAudience.AzureResourceManagerPublicCloud
      );
      assert.strictEqual(
         audienceFromLocation('northcentralus'),
         KnownContainerRegistryAudience.AzureResourceManagerPublicCloud
      );
      assert.strictEqual(
         audienceFromLocation('usgovtexas'),
         KnownContainerRegistryAudience.AzureResourceManagerGovernment
      );
      assert.strictEqual(
         audienceFromLocation('chinanorth2'),
         KnownContainerRegistryAudience.AzureResourceManagerChina
      );
      assert.strictEqual(
         audienceFromLocation('germanynortheast'),
         KnownContainerRegistryAudience.AzureResourceManagerGermany
      );
   });
});
