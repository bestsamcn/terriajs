import Terria from "../../lib/Models/Terria";
import createCatalogItemFromUrl from "../../lib/Models/createCatalogItemFromUrl";
import WebMapServiceCatalogGroup from "../../lib/Models/WebMapServiceCatalogGroup";
import GeoJsonCatalogItem from "../../lib/Models/GeoJsonCatalogItem";
import CatalogMemberFactory from "../../lib/Models/CatalogMemberFactory";
import { matchesExtension } from "../../lib/Models/registerCatalogMembers";
import UrlReference from "../../lib/Models/UrlReference";

describe("createCatalogItemFromUrl", function() {
  let terria: Terria;

  beforeEach(function() {
    terria = new Terria();

    CatalogMemberFactory.register(
      WebMapServiceCatalogGroup.type,
      WebMapServiceCatalogGroup
    );
    CatalogMemberFactory.register(GeoJsonCatalogItem.type, GeoJsonCatalogItem);
    CatalogMemberFactory.register(UrlReference.type, UrlReference);

    createCatalogItemFromUrl.register(
      s => true,
      WebMapServiceCatalogGroup.type,
      true
    );
    createCatalogItemFromUrl.register(
      matchesExtension("geojson"),
      GeoJsonCatalogItem.type,
      true
    );
  });

  it("should create an item of the first registered type", function(done) {
    const url = "test/WMS/single_metadata_url.xml";
    createCatalogItemFromUrl(url, terria).then(item => {
      expect(item).toBeDefined();

      if (item !== undefined) {
        expect(item instanceof UrlReference).toBe(true);
        expect(
          (<UrlReference>item).target instanceof WebMapServiceCatalogGroup
        ).toBe(true);
      }
      done();
    });
  });

  it("should create an item of the second registered type", function(done) {
    const url = "test/geoJSON/bike_racks.geojson";

    createCatalogItemFromUrl(url, terria).then(item => {
      expect(item).toBeDefined();
      if (item !== undefined) {
        expect(item instanceof UrlReference).toBe(true);
        expect((<UrlReference>item).target instanceof GeoJsonCatalogItem).toBe(
          true
        );
      }
      done();
    });
  });
});
