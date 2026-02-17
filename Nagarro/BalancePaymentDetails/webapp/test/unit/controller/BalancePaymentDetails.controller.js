/*global QUnit*/

sap.ui.define([
	"zbalancepaymentdetails/controller/BalancePaymentDetails.controller"
], function (Controller) {
	"use strict";

	QUnit.module("BalancePaymentDetails Controller");

	QUnit.test("I should test the BalancePaymentDetails controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
