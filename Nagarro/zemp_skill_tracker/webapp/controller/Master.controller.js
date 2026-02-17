sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/model/Sorter",
	"sap/m/GroupHeaderListItem",
	"sap/ui/Device",
	"sap/ui/core/Fragment",
	"../model/formatter",
	"sap/ui/core/format/DateFormat"
], function (BaseController, JSONModel, Filter, FilterOperator, Sorter, GroupHeaderListItem, Device, Fragment, formatter, DateFormat) {
	"use strict";

	return BaseController.extend("zempskilltracker.controller.Master", {

		formatter: formatter,

		/* =========================================================== */
		/* lifecycle methods                                           */
		/* =========================================================== */

		/**
		 * Called when the master list controller is instantiated. It sets up the event handling for the master/detail communication and other lifecycle tasks.
		 * @public
		 */
		onInit : function () {
			this.getOwnerComponent().getModel().setUseBatch(true);
			this.getOwnerComponent().getModel().setDefaultBindingMode(sap.ui.model.BindingMode.TwoWay);
			this.getRouter().getRoute("master").attachPatternMatched(this._onMasterMatched, this);
		},

		/* =========================================================== */
		/* event handlers                                              */
		/* =========================================================== */

		/**
		 * Shows the selected item on the detail page
		 * On phones a additional history entry is created
		 * @param {sap.m.ColumnListItem} oItem selected Item
		 * @public
		 */
		onItemPress : function (oItem) {
			var bReplace = !Device.system.phone;
			var sPath = oItem.getSource().getSelectedContexts()[0].getPath().replace("/","");
			// set the layout property of FCL control to show two columns
			this.getModel("appView").setProperty("/layout", "TwoColumnsMidExpanded");
			this.getRouter().navTo("detail", {
				EmployeePath : sPath
			}, bReplace);
		},

		/* =========================================================== */
		/* begin: internal methods                                     */
		/* =========================================================== */

		_onMasterMatched :  function() {
			//Set the layout property of the FCL control to 'OneColumn'
			this.getModel("appView").setProperty("/layout", "OneColumn");
		}
	});
});