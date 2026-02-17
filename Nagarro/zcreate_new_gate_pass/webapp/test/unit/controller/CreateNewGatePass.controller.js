/*global QUnit*/

sap.ui.define([
	"zcreatenewgatepass/controller/CreateNewGatePass.controller"
], function (Controller) {
	"use strict";

	QUnit.module("CreateNewGatePass Controller");

	QUnit.test("I should test the CreateNewGatePass controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
