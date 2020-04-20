import clone from "terriajs-cesium/Source/Core/clone";
import defined from "terriajs-cesium/Source/Core/defined";
import DisclaimerHandler from "./DisclaimerHandler";
import addedByUser from "../Core/addedByUser";
import getAncestors from "../Models/getAncestors";
import MouseCoords from "./MouseCoords";
import SearchState from "./SearchState";
import Terria from "../Models/Terria";
import {
  observable,
  reaction,
  IReactionDisposer,
  action,
  runInAction
} from "mobx";
import { BaseModel } from "../Models/Model";
import PickedFeatures from "../Map/PickedFeatures";

export const DATA_CATALOG_NAME = "data-catalog";
export const USER_DATA_NAME = "my-data";

interface ViewStateOptions {
  terria: Terria;
  catalogSearchProvider: any;
  locationSearchProviders: any[];
  errorHandlingProvider?: any;
}

/**
 * Root of a global view model. Presumably this should get nested as more stuff goes into it. Basically this belongs to
 * the root of the UI and then it can choose to pass either the whole thing or parts down as props to its children.
 */

export default class ViewState {
  readonly mobileViewOptions = Object.freeze({
    data: "data",
    preview: "preview",
    nowViewing: "nowViewing",
    locationSearchResults: "locationSearchResults"
  });
  readonly searchState: SearchState;
  readonly terria: Terria;

  @observable previewedItem: BaseModel | undefined;
  @observable userDataPreviewedItem: BaseModel | undefined;
  @observable explorerPanelIsVisible: boolean = false;
  @observable activeTabCategory: string = DATA_CATALOG_NAME;
  @observable activeTabIdInCategory: string | undefined = undefined;
  @observable isDraggingDroppingFile: boolean = false;
  @observable mobileView: string | null = null;
  @observable isMapFullScreen: boolean = false;
  @observable readonly notifications: any[] = [];
  @observable myDataIsUploadView: boolean = true;
  @observable mouseCoords: MouseCoords = new MouseCoords();
  @observable mobileMenuVisible: boolean = false;
  @observable explorerPanelAnimating: boolean = false;
  @observable topElement: string = "FeatureInfo";
  @observable lastUploadedFiles: any[] = [];
  @observable storyBuilderShown: boolean = false;

  // Flesh out later
  @observable showHelpMenu: boolean = false;
  @observable showSatelliteGuidance: boolean = false;
  @observable showWelcomeMessage: boolean = false;
  @observable selectedHelpMenuItem: string = "";
  @observable helpPanelExpanded: boolean = false;

  @observable workbenchWithOpenControls: string | undefined = undefined;

  errorProvider: any | null = null;

  // default value is null, because user has not made decision to show or
  // not show story
  // will be explicitly set to false when user 1. dismiss story
  // notification or 2. close a story
  @observable storyShown: boolean | null = null;

  @observable currentStoryId: number = 0;
  @observable featurePrompts: any[] = [];

  /**
   * Gets or sets a value indicating whether the small screen (mobile) user interface should be used.
   * @type {Boolean}
   */
  @observable useSmallScreenInterface: boolean = false;

  /**
   * Gets or sets a value indicating whether the feature info panel is visible.
   * @type {Boolean}
   */
  @observable featureInfoPanelIsVisible: boolean = false;

  /**
   * Gets or sets a value indicating whether the feature info panel is collapsed.
   * When it's collapsed, only the title bar is visible.
   * @type {Boolean}
   */
  @observable featureInfoPanelIsCollapsed: boolean = false;

  /**
   * True if this is (or will be) the first time the user has added data to the map.
   * @type {Boolean}
   */
  @observable firstTimeAddingData: boolean = true;

  /**
   * Gets or sets a value indicating whether the feedback form is visible.
   * @type {Boolean}
   */
  @observable feedbackFormIsVisible: boolean = false;

  /**
   * Gets or sets a value indicating whether the catalog's model share panel
   * is currently visible.
   */
  @observable shareModelIsVisible: boolean = false;

  private _unsubscribeErrorListener: any;
  private _pickedFeaturesSubscription: IReactionDisposer;
  private _isMapFullScreenSubscription: IReactionDisposer;
  private _showStoriesSubscription: IReactionDisposer;
  private _mobileMenuSubscription: IReactionDisposer;
  private _storyPromptSubscription: IReactionDisposer;
  private _previewedItemIdSubscription: IReactionDisposer;
  private _disclaimerHandler: DisclaimerHandler;

  constructor(options: ViewStateOptions) {
    const terria = options.terria;
    this.searchState = new SearchState({
      terria: terria,
      catalogSearchProvider: options.catalogSearchProvider,
      locationSearchProviders: options.locationSearchProviders
    });

    this.errorProvider = options.errorHandlingProvider
      ? options.errorHandlingProvider
      : null;
    this.terria = terria;

    // Show errors to the user as notifications.
    this._unsubscribeErrorListener = terria.error.addEventListener(<any>((
      e: any
    ) => {
      // Only add this error if an identical one doesn't already exist.
      if (
        this.notifications.filter(
          item => item.title === e.title && item.message === e.message
        ).length === 0
      ) {
        runInAction(() => {
          this.notifications.push(clone(e));
        });
      }
    }));

    // When features are picked, show the feature info panel.
    this._pickedFeaturesSubscription = reaction(
      () => this.terria.pickedFeatures,
      (pickedFeatures: PickedFeatures | undefined) => {
        if (defined(pickedFeatures)) {
          this.featureInfoPanelIsVisible = true;
          this.featureInfoPanelIsCollapsed = false;
        }
      }
    );

    this._isMapFullScreenSubscription = reaction(
      () =>
        terria.userProperties.get("hideWorkbench") === "1" ||
        terria.userProperties.get("hideExplorerPanel") === "1",
      (isMapFullScreen: boolean) => {
        this.isMapFullScreen = isMapFullScreen;

        // if /#hideWorkbench=1 exists in url onload, show stories directly
        // any show/hide workbench will not automatically show story
        if (!defined(this.storyShown)) {
          // why only checkk config params here? because terria.stories are not
          // set at the moment, and that property will be checked in rendering
          // Here are all are checking are: is terria story enabled in this app?
          // if so we should show it when app first laod, if workbench is hiddne
          this.storyShown = terria.configParameters.storyEnabled;
        }
      }
    );

    this._showStoriesSubscription = reaction(
      () => Boolean(terria.userProperties.get("playStory")),
      (playStory: boolean) => {
        this.storyShown = terria.configParameters.storyEnabled && playStory;
      }
    );

    this._mobileMenuSubscription = reaction(
      () => this.mobileMenuVisible,
      (mobileMenuVisible: boolean) => {
        if (mobileMenuVisible) {
          this.explorerPanelIsVisible = false;
          this.switchMobileView(null);
        }
      }
    );

    this._disclaimerHandler = new DisclaimerHandler(terria, this);

    this._storyPromptSubscription = reaction(
      () => this.storyShown,
      (storyShown: boolean | null) => {
        if (storyShown === false) {
          // only show it once
          if (!this.terria.getLocalProperty("storyPrompted")) {
            this.toggleFeaturePrompt("story", true, false);
          }
        }
      }
    );

    this._previewedItemIdSubscription = reaction(
      () => this.terria.previewedItemId,
      (previewedItemId: string | undefined) => {
        if (previewedItemId === undefined) {
          return;
        }

        const model = this.terria.getModelById(BaseModel, previewedItemId);
        if (model !== undefined) {
          this.viewCatalogMember(model);
        }
      }
    );
  }

  dispose() {
    this._pickedFeaturesSubscription();
    this._unsubscribeErrorListener();
    this._mobileMenuSubscription();
    this._isMapFullScreenSubscription();
    this._showStoriesSubscription();
    this._storyPromptSubscription();
    this._previewedItemIdSubscription();
    this._disclaimerHandler.dispose();
    this.searchState.dispose();
  }

  @action
  setTopElement(key: string) {
    this.topElement = key;
  }

  @action
  openAddData() {
    this.explorerPanelIsVisible = true;
    this.activeTabCategory = DATA_CATALOG_NAME;
    this.switchMobileView(this.mobileViewOptions.data);
  }

  @action
  openUserData() {
    this.explorerPanelIsVisible = true;
    this.activeTabCategory = USER_DATA_NAME;
  }

  @action
  closeCatalog() {
    this.explorerPanelIsVisible = false;
    this.switchMobileView(null);
    this.clearPreviewedItem();
  }

  @action
  searchInCatalog(query: string) {
    this.openAddData();
    this.searchState.catalogSearchText = query;
    this.searchState.searchCatalog();
  }

  @action
  clearPreviewedItem() {
    this.userDataPreviewedItem = undefined;
    this.previewedItem = undefined;
  }

  @action
  viewCatalogMember(catalogMember: BaseModel) {
    if (addedByUser(catalogMember)) {
      this.userDataPreviewedItem = catalogMember;
      this.openUserData();
    } else {
      this.previewedItem = catalogMember;
      this.openAddData();
      if (this.terria.configParameters.tabbedCatalog) {
        // Go to specific tab
        this.activeTabIdInCategory = getAncestors(catalogMember)[0].uniqueId;
      }
    }
  }

  @action
  switchMobileView(viewName: string | null) {
    this.mobileView = viewName;
  }

  @action
  showHelpPanel() {
    this.showHelpMenu = true;
    this.helpPanelExpanded = false;
    this.selectedHelpMenuItem = "";
    this.setTopElement("HelpPanel");
  }

  @action
  selectHelpMenuItem(key: string) {
    this.selectedHelpMenuItem = key;
    this.helpPanelExpanded = true;
  }

  @action
  hideHelpPanel() {
    this.showHelpMenu = false;
  }

  /**
   * Removes references of a model from viewState
   */
  @action
  removeModelReferences(model: BaseModel) {
    if (this.previewedItem === model) this.previewedItem = undefined;
    if (this.userDataPreviewedItem === model)
      this.userDataPreviewedItem = undefined;
  }

  getNextNotification() {
    return this.notifications.length && this.notifications[0];
  }

  hideMapUi() {
    return this.getNextNotification() && this.getNextNotification().hideUi;
  }

  toggleFeaturePrompt(
    feature: string,
    state: boolean,
    persistent: boolean = false
  ) {
    const featureIndexInPrompts = this.featurePrompts.indexOf(feature);
    if (
      state &&
      featureIndexInPrompts < 0 &&
      !this.terria.getLocalProperty(`${feature}Prompted`)
    ) {
      this.featurePrompts.push(feature);
    } else if (!state && featureIndexInPrompts >= 0) {
      this.featurePrompts.splice(featureIndexInPrompts, 1);
    }
    if (persistent) {
      this.terria.setLocalProperty(`${feature}Prompted`, true);
    }
  }

  viewingUserData() {
    return this.activeTabCategory === USER_DATA_NAME;
  }

  afterTerriaStarted() {
    if (this.terria.configParameters.openAddData) {
      this.openAddData();
    }
  }
}
