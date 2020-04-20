import i18next from "i18next";
import { runInAction, computed } from "mobx";
import TerriaError from "../Core/TerriaError";
import AsyncChartableMixin from "../ModelMixins/AsyncChartableMixin";
import AsyncMappableMixin from "../ModelMixins/AsyncMappableMixin";
import CatalogMemberMixin from "../ModelMixins/CatalogMemberMixin";
import TableMixin from "../ModelMixins/TableMixin";
import UrlMixin from "../ModelMixins/UrlMixin";
import Csv from "../Table/Csv";
import TableAutomaticStylesStratum from "../Table/TableAutomaticStylesStratum";
import CsvCatalogItemTraits from "../Traits/CsvCatalogItemTraits";
import CreateModel from "./CreateModel";
import proxyCatalogItemUrl from "./proxyCatalogItemUrl";
import StratumOrder from "./StratumOrder";
import Terria from "./Terria";
import AutoRefreshingMixin from "../ModelMixins/AutoRefreshingMixin";
import isDefined from "../Core/isDefined";
import { BaseModel } from "./Model";

// Types of CSVs:
// - Points - Latitude and longitude columns or address
// - Regions - Region column
// - Chart - No spatial reference at all
// - Other geometry - e.g. a WKT column

// Types of time varying:
// - ID+time column -> point moves, region changes (continuously?) over time
// - points, no ID, time -> "blips" with a duration (perhaps provided by another column)
//

const automaticTableStylesStratumName = "automaticTableStyles";

export default class CsvCatalogItem extends TableMixin(
  AsyncChartableMixin(
    AsyncMappableMixin(
      AutoRefreshingMixin(
        UrlMixin(CatalogMemberMixin(CreateModel(CsvCatalogItemTraits)))
      )
    )
  )
) {
  static get type() {
    return "csv";
  }

  private _csvFile?: File;

  constructor(
    id: string | undefined,
    terria: Terria,
    sourceReference?: BaseModel
  ) {
    super(id, terria, sourceReference);
    this.strata.set(
      automaticTableStylesStratumName,
      new TableAutomaticStylesStratum(this)
    );
  }

  get type() {
    return CsvCatalogItem.type;
  }

  setFileInput(file: File) {
    this._csvFile = file;
  }

  @computed
  get hasLocalData(): boolean {
    return isDefined(this._csvFile);
  }

  @computed
  get canZoomTo() {
    const s = this.strata.get(automaticTableStylesStratumName);
    // Zooming to tables with lat/lon columns works
    if (
      isDefined(s) &&
      isDefined(s.defaultStyle) &&
      s.defaultStyle.latitudeColumn !== undefined
    )
      return true;
    return false;
  }

  /*
   * The polling URL to use for refreshing data.
   */
  @computed get refreshUrl() {
    return this.polling.url || this.url;
  }

  /*
   * Called by AutoRefreshingMixin to get the polling interval
   */
  @computed get refreshInterval() {
    if (this.refreshUrl) {
      return this.polling.seconds;
    }
  }

  /*
   * Hook called by AutoRefreshingMixin to refresh data.
   *
   * The refresh happens only if a `refreshUrl` is defined.
   * If `shouldReplaceData` is true, then the new data replaces current data,
   * otherwise new data is appended to current data.
   */
  refreshData() {
    if (!this.refreshUrl) {
      return;
    }

    Csv.parseUrl(proxyCatalogItemUrl(this, this.refreshUrl, "1d"), true).then(
      dataColumnMajor => {
        runInAction(() => {
          if (this.polling.shouldReplaceData) {
            this.dataColumnMajor = dataColumnMajor;
          } else {
            this.append(dataColumnMajor);
          }
        });
      }
    );
  }

  protected forceLoadMetadata(): Promise<void> {
    return Promise.resolve();
  }

  protected forceLoadTableData(): Promise<string[][]> {
    if (this.csvString !== undefined) {
      return Csv.parseString(this.csvString, true);
    } else if (this._csvFile !== undefined) {
      return Csv.parseFile(this._csvFile, true);
    } else if (this.url !== undefined) {
      return Csv.parseUrl(proxyCatalogItemUrl(this, this.url, "1d"), true);
    } else {
      return Promise.reject(
        new TerriaError({
          sender: this,
          title: i18next.t("models.csv.unableToLoadItemTitle"),
          message: i18next.t("models.csv.unableToLoadItemMessage")
        })
      );
    }
  }
}

StratumOrder.addLoadStratum(automaticTableStylesStratumName);
