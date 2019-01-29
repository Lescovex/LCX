import { Injectable} from '@angular/core';
import { Router } from '@angular/router'
import { MdDialog } from '@angular/material';

//services
import { WalletService } from './wallet.service';
import { AccountService } from "./account.service";
import { Web3 } from "./web3.service";
import { ContractService } from './contract.service';
import { EtherscanService } from './etherscan.service';

import { LoadingDialogComponent } from '../components/dialogs/loading-dialog.component';

//0x imports
import { assetDataUtils, BigNumber, ContractWrappers, generatePseudoRandomSalt, Order, orderHashUtils, signatureUtils, AssetProxyId} from '0x.js';
import { RedundantSubprovider, RPCSubprovider, SignerSubprovider, Web3ProviderEngine, PrivateKeyWalletSubprovider } from '@0x/subproviders';
import { HttpClient, OrderbookRequest, OrderConfigRequest, OrderbookResponse, SignedOrder } from '@0x/connect';
import { Web3Wrapper } from '@0x/web3-wrapper';
import { getContractAddressesForNetworkOrThrow } from '@0x/contract-addresses/lib/src';
import { OrderWatcher } from '@0x/order-watcher';

import * as EthWallet from 'ethereumjs-wallet';

const fs = require('fs');
const homedir = require('os').homedir();
const lescovexPath = homedir+"/.lescovex";

@Injectable()
export class ZeroExService{
  
  
  //0x Config
  public contractAddresses;
  protected contractWrappers;
  protected httpClient;
  protected subproviders;
  protected privateKeyWalletSubprovider;
  protected web3Wrapper;
  public orderWatcher;
  protected providerEngine;
  protected providerAddress;
  //protected providerAddress = "http://0x.lescovex.com/v2";
  protected webSocketProviderAddress;
  

  protected DECIMALS = 18;
  public NULL_ADDRESS = '0x0000000000000000000000000000000000000000';
  //public ZERO = new BigNumber(0);
  //public UNLIMITED_ALLOWANCE_IN_BASE_UNITS = new BigNumber(2).pow(256).minus(1)

  public interval;
  public interval2;
  public loadingD;

  public orderbook;
  public asks=[];
  public bids = [];
  public asset_pairs = [];
  public check_asset_pairs = [];
  public updated_asset_pairs = [];
  public localState;
  public token: any;
  public state:any={
		orders : undefined,
		myOrders: undefined,
		myTrades: undefined,
		myFunds: undefined	
  };
  public showBuys;
  public showSells;
  
  protected abiBytes = require("../../libs/0x/abiBytes.json");
  protected config;

  public display = '';
  public funds = [];
  public allOrders = [];
  public doneOrders = [];
  public moment = require('moment');
  constructor(public _account: AccountService, private _wallet : WalletService, protected dialog: MdDialog, private _web3: Web3, protected router: Router, private _scan: EtherscanService, private _contract: ContractService){
    this.init();    
  }
  
  async init(){
    this.config = require("../../libs/0x/config/"+this._web3.network.urlStarts+".json");
    this.providerAddress = this.config.sra_http_endpoint;
    this.webSocketProviderAddress = this.config.sra_ws_endpoint;
    
    this.activateLoading();
    await this.setProvider();

    await this.getLocalInfo();
    this.loadingD.close();
    
    await this.checkAssetPairs(1);
    await this.setToken();
    
    await this.checkMyFunds();
    await this.checkMyDoneOrders();
  }

  async checkMyFunds(){
    
    let mem = [];
    let control= false;
    while(control == false){
      let hist = this._account.account.history;
      if(hist != null){
        for (let i = 0; i < hist.length; i++) {
          if(hist[i].from == this.contractAddresses.etherToken || (hist[i].to == this.contractAddresses.etherToken && hist[i].value != '0')){
            mem.push(hist[i])
          }
        }
        this.funds = mem;
        control = true;
      }
    } 
  }

  async checkMyDoneOrders(){
    
    let control = false;
    let date = new BigNumber(Date.now()).div(1000).ceil();
    let dateToNumber = date.toNumber();
  
    while(control == false){
      let mem = [];
      if(this.localState.allOrders != null){
        for (let i = 0; i < this.localState.allOrders.length; i++) {
          if(dateToNumber >= parseInt(this.localState.allOrders[i].timestamp) && this._account.account.address == this.localState.allOrders[i].account && this.token.assetDataA.assetData == this.localState.allOrders[i].assetDataA.assetData && this.token.assetDataB.assetData == this.localState.allOrders[i].assetDataB.assetData){
            let orderInfo = await this.contractWrappers.exchange.getOrderInfoAsync(this.localState.allOrders[i].signedOrder);
            let decimals = this.token.assetDataA.decimals;
            let x = decimals.toString();
            let exp = 10 ** parseInt(x);

            
            
            if(this.localState.allOrders[i].action == 'buy' && this.localState.allOrders[i].filled == 0){
              this.localState.allOrders[i].orderTakerAssetFilledAmount = orderInfo.orderTakerAssetFilledAmount / exp;
              this.localState.allOrders[i].orderMakerAssetFilledAmount = this.localState.allOrders[i].orderTakerAssetFilledAmount * this.localState.allOrders[i].priceTokenB;
            }
            if(this.localState.allOrders[i].action == 'sell' && this.localState.allOrders[i].filled == 0){
              this.localState.allOrders[i].orderTakerAssetFilledAmount = orderInfo.orderTakerAssetFilledAmount / exp;
              this.localState.allOrders[i].orderMakerAssetFilledAmount = this.localState.allOrders[i].orderTakerAssetFilledAmount * this.localState.allOrders[i].priceTokenA;
            }

            //esto dará error a la segunda vuelta
            if(this.localState.allOrders[i].action == 'buy' && this.localState.allOrders[i].filled != 0){
              console.log("filled?",this.localState.allOrders[i].filled);
              
              this.localState.allOrders[i].orderTakerAssetFilledAmount = this.localState.allOrders[i].filled / exp;
              console.log("orderTakerAssetFilledAmount",this.localState.allOrders[i].orderTakerAssetFilledAmount);
              
              this.localState.allOrders[i].orderMakerAssetFilledAmount = this.localState.allOrders[i].orderTakerAssetFilledAmount * this.localState.allOrders[i].priceTokenB;
              console.log("orderMakerAssetFilledAmount",this.localState.allOrders[i].orderMakerAssetFilledAmount);
            }
            if(this.localState.allOrders[i].action == 'sell' && this.localState.allOrders[i].filled != 0){
              console.log("filled?",this.localState.allOrders[i].filled);
              this.localState.allOrders[i].orderTakerAssetFilledAmount = this.localState.allOrders[i].filled / exp;
              console.log("orderTakerAssetFilledAmount",this.localState.allOrders[i].orderTakerAssetFilledAmount);
              this.localState.allOrders[i].orderMakerAssetFilledAmount = this.localState.allOrders[i].orderTakerAssetFilledAmount * this.localState.allOrders[i].priceTokenA;
              console.log("orderMakerAssetFilledAmount",this.localState.allOrders[i].orderMakerAssetFilledAmount);
            }

            mem.push(this.localState.allOrders[i]);

          }
          
        }
        this.allOrders = mem;
        console.log("QUE ES MEM?",mem);
        
        console.log("QUE ES ALL ORDERS?",this.allOrders);
        
        control = true;
      }
    }
   
  }

  

  async getLocalInfo(){
		if(!fs.existsSync(lescovexPath)){
		  fs.mkdirSync(lescovexPath);
		}
		
		let filePath = lescovexPath+"/.0x-"+this._web3.network.urlStarts+".json";
		let x = [];
		if(!fs.existsSync(filePath)){
			let objNet = {
        network_name: this._web3.network.urlStarts,
        network_chain_id: this._web3.network.chain,
        sra_http_endpoint: this.config.sra_http_endpoint,
        sra_ws_endpoint: this.config.sra_ws_endpoint,
        default_contract_addresses: this.config.default_contract_addresses,
        default_token: this.config.default_token,
        asset_pairs: this.config.asset_pairs,
        allOrders: x
			}

			fs.writeFileSync(filePath , JSON.stringify(objNet));
		}
    let data = fs.readFileSync(filePath);
    
		try {
			this.localState =  JSON.parse(data);
		} catch (error) {
			console.log(error);
			fs.unlink(filePath, (err) => {
				if (err) throw err;
				console.log('successfully deleted', filePath);
			  });
			this.getLocalInfo();
    }

      console.log("localState on init?????",this.localState);
      
      this.asset_pairs = this.localState.asset_pairs;
  }
  
  setProvider(pass?){
    let ZERO = new BigNumber(0);
    let netNumber = this._web3.network.chain;
    let net = this._web3.network.urlStarts;
    if(pass != null){
      let error = "";
      let wallet;
      let key;

      try{
        wallet = EthWallet.fromV3(this._account.account.v3, pass);
      }catch(e){
        error= e.message;
      }
      console.log("wallet", wallet);
      
      if(error==""){
        key = wallet.getPrivateKeyString()
        
      }
      console.log("key",key);
      
      let substr = key.substring(2, key.length)
      
      this.providerEngine = new Web3ProviderEngine();
      
      this.privateKeyWalletSubprovider =  new PrivateKeyWalletSubprovider(substr);
      this.providerEngine.addProvider(this.privateKeyWalletSubprovider);
      
    }else{
      this.providerEngine = new Web3ProviderEngine();
      console.log("this._web3.web3", this._web3.web3);
      
      this.privateKeyWalletSubprovider =  new RPCSubprovider(this._web3.web3.currentProvider.host);
      this.providerEngine.addProvider(this.privateKeyWalletSubprovider);
      
    }
      this.subproviders = [new RPCSubprovider('https://'+net+'.infura.io')];
      this.providerEngine.addProvider(new RedundantSubprovider(this.subproviders));
      this.httpClient = new HttpClient(this.providerAddress);
      this.providerEngine.start();
      
      
      this.orderWatcher = new OrderWatcher(this.providerEngine, netNumber);
      let x = this.orderWatcher.getStats();
        //this.orderWatcher.start();
        console.log("orderWatcher??????",this.orderWatcher);
        console.log("orderWatcher get stats", x);
        
      

      /*
      
      TESTING ORDERWATCHER HERE!!!!
      
      
      */
      this.contractWrappers = new ContractWrappers(this.providerEngine, {networkId: netNumber});
      console.log("ContractWrappers",this.contractWrappers);
      this.contractAddresses = getContractAddressesForNetworkOrThrow(this._web3.network.chain);
      this.config.default_contract_addresses = this.contractAddresses;

      console.log("contractAddresses", this.contractAddresses);
      
      //this.setContract();
      this.httpClient = new HttpClient(this.providerAddress);
      this.web3Wrapper = new Web3Wrapper(this.providerEngine);
}

  async checkAssetPairs(checkTime){
    let response = await this.httpClient.getAssetPairsAsync({ networkId: this._web3.network.chain, page: checkTime});
    console.log("CheckAssetPairs response???", response);
    if (response.total === 0) {
      console.log("ASSET PAIRS RESPONSE == 0");
      this.asset_pairs = [];
      this.config.asset_pairs = [];
      //this.asset_pairs == response.response;
    }else{
      //do things
      let storedInfo;
      let decodedInfo;
      for (let i = 0; i < response.records.length; i++) {
        storedInfo = this.in_Array(response.records[i], this.asset_pairs)
        //console.log("CHECKPOINT VALUE",storedInfo);
        if(storedInfo != false){
          this.check_asset_pairs.push(storedInfo);
        }else{
          decodedInfo = await this.decodeAssetPairInfo(response.records[i]);
          console.log("decoded INFO????", decodedInfo);
          
          this.check_asset_pairs.push(decodedInfo);
          this.updated_asset_pairs.push(decodedInfo);
        }
        
      }

      if(response.total > response.page * response.perPage){
        await this.checkAssetPairs(checkTime+1);
      } else {
        console.log("CHECK ASSET PAIRS DONE!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
        this.asset_pairs = this.check_asset_pairs;
        this.config.asset_pairs = this.asset_pairs;
        this.check_asset_pairs = [];
        console.log("All Asset Pairs", this.asset_pairs);
        if(this.updated_asset_pairs.length > 0){
          this.saveConfigFile();  
        }
      }
    }
    
  }
  
  async decodeAssetPairInfo(tokenToDecode){
    let decodedA;
    let decodedB;
    try {
      decodedA = assetDataUtils.decodeERC20AssetData(tokenToDecode.assetDataA.assetData);
    } catch (error) {
      console.log("DECODE A ERROR", error);
    }
    try {
      decodedB = assetDataUtils.decodeERC20AssetData(tokenToDecode.assetDataB.assetData);
    } catch (error) {
      console.log("DECODE B ERROR", error);
    }
    
    let symbolA;
    let symbolB;
    try {
      symbolA = await this.getSymbol(decodedA.tokenAddress);  
    } catch (error) {
      console.log("SYMBOL A ERROR", error);
    }
    try {
      symbolB = await this.getSymbol(decodedB.tokenAddress);  
    } catch (error) {
     console.log("SYMBOL B ERROR", error);
      
    }
    console.log("symbol",symbolA, symbolB);
    
    let decimalsA;
    let decimalsB;

    try {
      decimalsA = await this.getDecimals(decodedA.tokenAddress);  
      console.log("DECIMALS A TO NUMBER",decimalsA.toNumber());
      
    } catch (error) {
      console.log("DECIMALS A ERROR",error);
      decimalsA = null
    }
    
    try {
      decimalsB = await this.getDecimals(decodedA.tokenAddress);
      console.log("DECIMALS B TO NUMBER",decimalsB.toNumber());
    } catch (error) {
      decimalsB = null
      console.log("DECIMALS B ERROR", error);
    }
    let symbolString = symbolA + " - " + symbolB;
    let reverseSymbolString = symbolB + " - " + symbolA;

    let pairA = {
      ...tokenToDecode.assetDataA,
      ...decodedA,
      decimals: decimalsA,
      name: symbolA,
      allowed: null
    };
    let pairB = {
      ...tokenToDecode.assetDataB,
      ...decodedB,
      decimals: decimalsB,
      name: symbolB,
      allowed: null
    }

    let pairC = {
      assetDataA: pairA,
      assetDataB: pairB,
      reverseName: symbolString,
      name: reverseSymbolString
    }
    
    return pairC;
  }

  async saveConfigFile(){
    console.log("saveConfigFile?");
    
    let filePath = lescovexPath+"/.0x-"+this._web3.network.urlStarts+".json";
    if(this.updated_asset_pairs.length > 0){
      for (let i = 0; i < this.updated_asset_pairs.length; i++) {
        this.localState.asset_pairs.push(this.updated_asset_pairs[i]);
        
      }
    }
    
    try {
      console.log("localstate try???");
      
      JSON.stringify(this.localState);      
    }catch (e)  {
      console.log("JSON ERROR", e)
    }
    
    try{
      fs.writeFileSync(filePath, JSON.stringify(this.localState));
      console.log("FILE SAVED");
      this.updated_asset_pairs = [];
      
    }catch(e) {
      console.log("FILESYNC ERROR",e);
    }
          
  }

  in_Array(responseObject, storedObject) {
    var length = storedObject.length;
    for(var i = 0; i < length; i++) {
        if(storedObject[i].assetDataA.assetData == responseObject.assetDataA.assetData && storedObject[i].assetDataB.assetData == responseObject.assetDataB.assetData){
          return storedObject[i];
        }
    }
    console.log("false?", responseObject);
    return false;
}

  async order(form, action, pass){
    console.log("FORRRRRMM?!??!?!!??!",form);
    
    await this.setProvider(pass);
    let [maker, taker]= await this.web3Wrapper.getAvailableAddressesAsync();
    console.log("maker", maker);
    
    taker = this.NULL_ADDRESS;
    let exchangeAddress = this.contractAddresses.exchange;
    
    let makerAssetData;
    let makerAssetAmount;
    let takerAssetData;
    let takerAssetAmount;
    
    let makerTokenAddress;
    if(action == 'buy'){
      console.log("action == buy");
      //sell weth to buy ZRX
      makerAssetData = assetDataUtils.encodeERC20AssetData(this.token.assetDataB.tokenAddress);
      takerAssetData = assetDataUtils.encodeERC20AssetData(this.token.assetDataA.tokenAddress);

      makerTokenAddress = this.token.assetDataB.tokenAddress;

      makerAssetAmount = Web3Wrapper.toBaseUnitAmount(new BigNumber(form.total.value), parseInt(this.token.assetDataB.decimals));//give weth
      takerAssetAmount = Web3Wrapper.toBaseUnitAmount(new BigNumber(form.amount.value), parseInt(this.token.assetDataA.decimals));//get zrx
      //let x = await this.setUnlimitedProxyAllowance(this.token.assetDataB.tokenAddress, maker);
      //console.log("setUnlimitedProxyAllowance",x);
      let ApprovalTxHash = await this.contractWrappers.erc20Token.setUnlimitedProxyAllowanceAsync(
        this.token.assetDataB.tokenAddress,
        maker,
      );
      await this.web3Wrapper.awaitTransactionSuccessAsync(ApprovalTxHash);
    }

    if(action == 'sell'){
      console.log("action == sell");
      //sell zrx to buy weth
      makerAssetData = assetDataUtils.encodeERC20AssetData(this.token.assetDataA.tokenAddress);
      takerAssetData = assetDataUtils.encodeERC20AssetData(this.token.assetDataB.tokenAddress);

      makerTokenAddress = this.token.assetDataA.tokenAddress;

      makerAssetAmount = Web3Wrapper.toBaseUnitAmount(new BigNumber(form.amount.value), parseInt(this.token.assetDataA.decimals));//give zrx
      takerAssetAmount = Web3Wrapper.toBaseUnitAmount(new BigNumber(form.total.value), parseInt(this.token.assetDataB.decimals));//get weth
      //let x = await this.setUnlimitedProxyAllowance(this.token.assetDataA.tokenAddress, maker);
      //console.log("setUnlimitedProxyAllowance",x);
      let ApprovalTxHash = await this.contractWrappers.erc20Token.setUnlimitedProxyAllowanceAsync(
        this.token.assetDataA.tokenAddress,
        maker,
      );
      await this.web3Wrapper.awaitTransactionSuccessAsync(ApprovalTxHash);
    }
 
    //console.log("EXPIRATION BEFORE",randomExpiration.toNumber());
    //var duration:any = 60*60*24;
    let randomExpiration = this.getRandomFutureDateInSeconds(form.expires.value, form.type.value);
    
    let orderConfigRequest : OrderConfigRequest= {
      makerAddress: maker,
      takerAddress: taker,
      makerAssetAmount,
      takerAssetAmount,
      makerAssetData,
      takerAssetData,
      exchangeAddress,
      expirationTimeSeconds: randomExpiration ,
    }
    console.log("EXPIRATION AFTER", randomExpiration.toNumber());
    console.log("orderConfigRequest",orderConfigRequest);
    
    let orderConfig = await this.getOrderConfig(orderConfigRequest);
    console.log("orderConfig",orderConfig);
    
    let order: Order = {
        salt: generatePseudoRandomSalt(),
        ...orderConfigRequest,
        ...orderConfig,
    };
    
    console.log("order",order);
    
    console.log(order.makerFee.toNumber());
    /*
    let redeableMakerFee:any = makerAssetAmount.div(exp).toNumber();
    console.log("REDEABLE MAKER FEE", redeableMakerFee );
    */
    let orderHashHex = await orderHashUtils.getOrderHashHex(order);
    console.log("orderHashHex",orderHashHex)
    let signature = await signatureUtils.ecSignHashAsync(this.providerEngine, orderHashHex, maker);
    console.log("signature",signature);

    let signedOrder : SignedOrder = {
      ...order, 
      signature
    };
    console.log("signedOrder",signedOrder);
    

    try {
      await this.contractWrappers.exchange.validateOrderFillableOrThrowAsync(signedOrder);
      console.log("validateOrder OK!");
      
    } catch (error) {
      console.log("validateOrderFillable error",error); 
      //openErrorDialog
      return false;
    }

    try {
      await this.httpClient.submitOrderAsync(signedOrder, { networkId: this._web3.network.chain});
      
      console.log("submit OK!");
      
    } catch (error) {
      console.log("submitOrder error",error);
      //openErrorDialog
      return false;
    }
    
    await this.saveOrder(orderHashHex, signedOrder,action);
    //await this.saveConfigFile();
    await this.getOrderbook(this.token.assetDataA.assetData, this.token.assetDataB.assetData, 1);
  }
  async saveOrder(orderHash, signedOrder, action, filled?){
    let date;
    let timestamp;
    let fills;
    if(filled == null){
      date = this.timestampFormats(signedOrder.expirationTimeSeconds);
      timestamp = signedOrder.expirationTimeSeconds;
      fills = 0;
    }else{
      let dt = new BigNumber(Date.now()).div(1000).ceil();
      let dateToNumber = dt.toNumber();
      date = this.timestampFormats(dateToNumber);
      timestamp = dateToNumber;
      fills = filled;
    }
    
   
    let decimals = this.token.assetDataA.decimals;
    let x = decimals.toString();
    let exp = 10 ** parseInt(x)
    let redeableTakerAmount = signedOrder.takerAssetAmount / exp;
    let redeableMakerAmount = signedOrder.makerAssetAmount / exp;
    
    let priceA;
    let priceB;
    if(action == 'buy'){
      priceA = signedOrder.takerAssetAmount.div(signedOrder.makerAssetAmount);
      priceB = signedOrder.makerAssetAmount.div(signedOrder.takerAssetAmount);
    }
    if(action == 'sell'){
      priceA = signedOrder.makerAssetAmount.div(signedOrder.takerAssetAmount);
      priceB = signedOrder.takerAssetAmount.div(signedOrder.makerAssetAmount);      
    }
    
    let empty = 0;
    let obj = {
      assetDataA: this.token.assetDataA,
      assetDataB: this.token.assetDataB,
      orderHash: orderHash,
      signedOrder: signedOrder,
      action: action,
      account: this._account.account.address,
      date: date,
      timestamp: timestamp,
      takerAmount: redeableTakerAmount,
      makerAmount: redeableMakerAmount,
      priceTokenA: priceA.toNumber(),
      priceTokenB: priceB.toNumber(),
      orderTakerAssetFilledAmount: empty,
      orderMakerAssetFilledAmount: empty,
      filled: fills
    }
    console.log("que es obj?",obj);
    //let orderOrders = 
    //console.log("ordered orders?", orderOrders);
    let orderOrders = this.localState.allOrders;
    try {
      console.log("try save order");
      
      orderOrders.push(obj);
    } catch (error) {
      console.log("catch save order");
      
      //this.localState.allOrders = [];
      orderOrders.push(obj);
    }
    this.localState.allOrders = this.orderByTimestamp(orderOrders);;
    //this.localState.allOrders.push(obj);
    console.log("All orders saved?",this.localState.allOrders);
    
    await this.checkMyDoneOrders();
    await this.saveConfigFile();
  }

  orderByTimestamp(object){
        
		object.sort(function (a, b) {
		  if ( parseInt(a.timestamp) > parseInt(b.timestamp))
			return -1;
		  if ( parseInt(a.timestamp) < parseInt(b.timestamp))
			return 1;
			return 0;
		})
	  
	  return object;
  }

  timestampFormats(unix_tm){
    let dt = new Date(parseInt(unix_tm)*1000); // Devuelve más 2 horas
    let date = dt.getDate()+"-"+(dt.getMonth()+1)+"-"+dt.getFullYear();
    let options = { month: 'short' };
    let month = dt.toLocaleDateString("i-default", options);
    let dayOptions = {day: "numeric"};
    let day = dt.toLocaleDateString("i-default", dayOptions);
    let hour = dt.getHours();
    let minutes = dt.getMinutes();
    let  time;
    if(minutes < 10){
      time = hour + ":0" + minutes;
    }else{
      time = hour + ":" + minutes;
    }
    let fullDate;
    var optionsFulldate = {weekday:"long",year:"numeric",month:"long", day:"numeric"};
    let strDate = dt.toLocaleDateString("i-default", optionsFulldate);
    fullDate = strDate + " " + time;
    
    let countdown = this.moment(dt).fromNow()
    let obj = {
      date: date,
      month: month,
      day: day,
      fullDate: fullDate,
      countdown: countdown
    }
    
    return obj;
  }
  
  async getOrderHash(order){
    let orderHashHex = await orderHashUtils.getOrderHashHex(order);
    return orderHashHex;
  }
  
  async validateFillOrder(order, value, taker){
    let decimals;
    if(order.takerData.tokenAddress == this.token.assetDataA.tokenAddress){
      decimals = this.token.assetDataA.decimals;
    }
    if(order.takerData.tokenAddress == this.token.assetDataB.tokenAddress){
      decimals = this.token.assetDataB.decimals;
    }
    let takerAssetAmount = Web3Wrapper.toBaseUnitAmount(new BigNumber(value), parseInt(decimals));
    try {
      let x = await this.contractWrappers.exchange.validateFillOrderThrowIfInvalidAsync(order.order, takerAssetAmount, taker); 
      console.log("que es x??",x);
       return true;
    } catch (error) {
      return false;
      //console.log("error of validateFillOrder", error); 
    }
  }
  async fillOrder(order, value, taker, key){
   
    await this.setProvider(key)
    
    //setUnlimitedAllowance
    let x = await this.setUnlimitedProxyAllowance(order.takerData.tokenAddress, taker);
    console.log(x);
    
    let TX_DEFAULTS = { gas: 400000 };
    let decimals;
    if(order.takerData.tokenAddress == this.token.assetDataA.tokenAddress){
      decimals = this.token.assetDataA.decimals;
    }
    if(order.takerData.tokenAddress == this.token.assetDataB.tokenAddress){
      decimals = this.token.assetDataB.decimals;
    }
    let takerAssetAmount = Web3Wrapper.toBaseUnitAmount(new BigNumber(value), parseInt(decimals));
    try {
      await this.contractWrappers.exchange.validateFillOrderThrowIfInvalidAsync(order.order, takerAssetAmount, taker);  
    } catch (error) {
      throw new Error(error);
      //console.log("error of validateFillOrder", error); 
    }
    let txHash = await this.contractWrappers.exchange.fillOrderAsync(order.order, takerAssetAmount, taker, {
        gasLimit: TX_DEFAULTS.gas,
    });
    await this.web3Wrapper.awaitTransactionSuccessAsync(txHash);
    await this.setBalances();
    await this.getOrderbook(this.token.assetDataA.assetData, this.token.assetDataB.assetData, 1);
    let obj = {
      exchangeAddress : order.order.exchangeAddress,
      expirationTimeSeconds : order.order.expirationTimeSeconds,
      feeRecipientAddress : order.order.feeRecipientAddress,
      makerAddress : order.order.makerAddress,
      makerAssetAmount : order.order.makerAssetAmount,
      makerAssetData : order.order.makerAssetData,
      makerFee : order.order.makerFee,
      salt : order.order.salt,
      senderAddress : order.order.senderAddress,
      takerAddress : order.order.takerAddress,
      takerAssetAmount : order.order.takerAssetAmount,
      takerAssetData : order.order.takerAssetData,
      takerFee : order.order.takerFee
    }

    
    let orderhash = await this.getOrderHash(obj);;
    if(order.action == 'buy'){
      await this.saveOrder(orderhash, order.order ,'sell', takerAssetAmount);
    }
    if(order.action == 'sell'){
      await this.saveOrder(orderhash, order.order ,'buy', takerAssetAmount);
    }
  }

  async getOrderbook(makerAssetData, takerAssetData, pageNumber){
    this.orderbook = null;
    this.asks=[];
    this.bids=[];

    let orderbookRequest: OrderbookRequest = { baseAssetData: makerAssetData, quoteAssetData: takerAssetData };
    let response = await this.httpClient.getOrderbookAsync(orderbookRequest, { networkId: this._web3.network.chain, page: pageNumber});
    console.log("ORDERBOOK RESPONSE?",response);
    let decodedMakerDataAsks;
    let decodedMakerDataBids;
    let decodedTakerDataAsks;
    let decodedTakerDataBids;
    let makerSymbol;
    let takerSymbol;
    let takerDecimals;

    if (response.asks.total === 0){
        this.orderbook = {
          asks: this.asks
        }
    }else{
      decodedMakerDataAsks = assetDataUtils.decodeERC20AssetData(response.asks.records[0].order.makerAssetData);
      decodedTakerDataAsks = assetDataUtils.decodeERC20AssetData(response.asks.records[0].order.takerAssetData);
      if(decodedMakerDataAsks.tokenAddress == this.token.assetDataA.tokenAddress && decodedTakerDataAsks.tokenAddress == this.token.assetDataB.tokenAddress){
        makerSymbol = this.token.assetDataA.name;
        takerSymbol = this.token.assetDataB.name;
        takerDecimals = this.token.assetDataB.decimals;
      }
      if(decodedMakerDataAsks.tokenAddress == this.token.assetDataB.tokenAddress && decodedTakerDataAsks.tokenAddress == this.token.assetDataA.tokenAddress){
        makerSymbol = this.token.assetDataB.name;
        takerSymbol = this.token.assetDataA.name;
        takerDecimals = this.token.assetDataA.decimals
      }

      for (let i = 0; i < response.asks.records.length; i++) {
        decodedMakerDataAsks = assetDataUtils.decodeERC20AssetData(response.asks.records[i].order.makerAssetData);
        decodedTakerDataAsks = assetDataUtils.decodeERC20AssetData(response.asks.records[i].order.takerAssetData);

        let orderPriceA = response.asks.records[i].order.makerAssetAmount.div(response.asks.records[i].order.takerAssetAmount).toNumber();
        let orderPriceB = response.asks.records[i].order.takerAssetAmount.div(response.asks.records[i].order.makerAssetAmount).toNumber();
        console.log("orderPrice on asks", orderPriceB);
        
        let takerAmount = response.asks.records[i].order.takerAssetAmount.toNumber();
        let makerAmount = response.asks.records[i].order.makerAssetAmount.toNumber();
        
        let remainingAmount;
        let filledAmount;
        let filledAmountOtherToken;

        let x = takerDecimals.toString();
        let exp = 10 ** parseInt(x)
        let readableTakerAmount = takerAmount / exp;
        let redeableMakerAmount = makerAmount / exp;
        //let date = this.timestampFormats(response.asks.records[i].order.expirationTimeSeconds);
        if(response.asks.records[i].metaData.remainingTakerAssetAmount != null){
          //console.log("Remaining Taker Amount", response.asks.records[i].metaData.remainingTakerAssetAmount);
          let obj = {
            exchangeAddress : response.asks.records[i].order.exchangeAddress,
            expirationTimeSeconds : response.asks.records[i].order.expirationTimeSeconds,
            feeRecipientAddress : response.asks.records[i].order.feeRecipientAddress,
            makerAddress : response.asks.records[i].order.makerAddress,
            makerAssetAmount : response.asks.records[i].order.makerAssetAmount,
            makerAssetData : response.asks.records[i].order.makerAssetData,
            makerFee : response.asks.records[i].order.makerFee,
            salt : response.asks.records[i].order.salt,
            senderAddress : response.asks.records[i].order.senderAddress,
            takerAddress : response.asks.records[i].order.takerAddress,
            takerAssetAmount : response.asks.records[i].order.takerAssetAmount,
            takerAssetData : response.asks.records[i].order.takerAssetData,
            takerFee : response.asks.records[i].order.takerFee
          }

          let orderhash = await this.getOrderHash(obj);
          let responsed = await  this.contractWrappers.exchange.getFilledTakerAssetAmountAsync(orderhash);
          filledAmount = responsed/exp;
          filledAmountOtherToken = filledAmount * orderPriceA;
          remainingAmount = readableTakerAmount - filledAmount;
          console.log("filledAmount", filledAmount);
          console.log("remainingAmount", remainingAmount);
        }else{
          filledAmount = 0;
          filledAmountOtherToken = 0;
          remainingAmount = readableTakerAmount;
        }
        
        let takerMinAmount;
        if(decodedTakerDataAsks.tokenAddress == this.token.assetDataA.tokenAddress){
          let val = this.token.assetDataA.minAmount;
          console.log("val", val);
          
          takerMinAmount = val/exp;
        }
        if(decodedTakerDataAsks.tokenAddress == this.token.assetDataB.tokenAddress){
          let val = this.token.assetDataB.minAmount;
          console.log("val", val);
          
          takerMinAmount = val/exp;
        }
        console.log("takerminamount?",takerMinAmount);
        let date = this.timestampFormats(response.asks.records[i].order.expirationTimeSeconds);
        let makerData = {
          ...decodedMakerDataAsks,
          symbol: makerSymbol
        }
        let takerData = {
          ...decodedTakerDataAsks,
          symbol: takerSymbol,
          decimals: takerDecimals
        }
        let obj = {
          ...response.asks.records[i],
          makerData: makerData,
          takerData: takerData,
          priceTokenA: orderPriceA,
          priceTokenB: orderPriceB,
          makerAmount: redeableMakerAmount,
          expirationTimeSeconds: response.asks.records[i].order.expirationTimeSeconds.toNumber(),
          takerAmount: readableTakerAmount,
          filledAmount: filledAmount,
          filledAmountOtherToken: filledAmountOtherToken,
          remainingAmount: remainingAmount,
          minAmount : takerMinAmount,
          date: date
        }
        this.asks.push(obj);
      }
    }
    if(response.bids.total === 0){
      this.orderbook = {
        bids: this.bids
      }
    }else{
      decodedMakerDataBids = assetDataUtils.decodeERC20AssetData(response.bids.records[0].order.makerAssetData);
      decodedTakerDataBids = assetDataUtils.decodeERC20AssetData(response.bids.records[0].order.takerAssetData);
      if(decodedMakerDataBids.tokenAddress == this.token.assetDataA.tokenAddress && decodedTakerDataBids.tokenAddress == this.token.assetDataB.tokenAddress){
        makerSymbol = this.token.assetDataA.name;
        takerSymbol = this.token.assetDataB.name;
        takerDecimals = this.token.assetDataB.decimals;
      }
      if(decodedMakerDataBids.tokenAddress == this.token.assetDataB.tokenAddress && decodedTakerDataBids.tokenAddress == this.token.assetDataA.tokenAddress){
        makerSymbol = this.token.assetDataB.name;
        takerSymbol = this.token.assetDataA.name;
        takerDecimals = this.token.assetDataA.decimals
      }
      
      for (let i = 0; i < response.bids.records.length; i++) {
        decodedMakerDataBids = assetDataUtils.decodeERC20AssetData(response.bids.records[i].order.makerAssetData);
        decodedTakerDataBids = assetDataUtils.decodeERC20AssetData(response.bids.records[i].order.takerAssetData);

        let orderPriceA = response.bids.records[i].order.takerAssetAmount.div(response.bids.records[i].order.makerAssetAmount).toNumber();
        let orderPriceB = response.bids.records[i].order.makerAssetAmount.div(response.bids.records[i].order.takerAssetAmount).toNumber();
        console.log("orderPrice on BIDS", orderPriceB);
        
        let takerAmount = response.bids.records[i].order.takerAssetAmount.toNumber();
        let makerAmount = response.bids.records[i].order.makerAssetAmount.toNumber();
        
        let remainingAmount;
        let filledAmount;
        let filledAmountOtherToken;
        let x = takerDecimals.toString();
        let exp = 10 ** parseInt(x)
        let readableTakerAmount = takerAmount / exp;
        let redeableMakerAmount = makerAmount / exp;
        if(response.bids.records[i].metaData.remainingTakerAssetAmount != null){
          console.log("Remaining Taker Amount", response.bids.records[i].metaData.remainingTakerAssetAmount);
          let obj = {
            exchangeAddress : response.bids.records[i].order.exchangeAddress,
            expirationTimeSeconds : response.bids.records[i].order.expirationTimeSeconds,
            feeRecipientAddress : response.bids.records[i].order.feeRecipientAddress,
            makerAddress : response.bids.records[i].order.makerAddress,
            makerAssetAmount : response.bids.records[i].order.makerAssetAmount,
            makerAssetData : response.bids.records[i].order.makerAssetData,
            makerFee : response.bids.records[i].order.makerFee,
            salt : response.bids.records[i].order.salt,
            senderAddress : response.bids.records[i].order.senderAddress,
            takerAddress : response.bids.records[i].order.takerAddress,
            takerAssetAmount : response.bids.records[i].order.takerAssetAmount,
            takerAssetData : response.bids.records[i].order.takerAssetData,
            takerFee : response.bids.records[i].order.takerFee
          }

          let orderhash = await this.getOrderHash(obj);
          let responsed = await  this.contractWrappers.exchange.getFilledTakerAssetAmountAsync(orderhash);
          filledAmount = responsed/exp;
          filledAmountOtherToken = filledAmount * orderPriceB;
          remainingAmount = readableTakerAmount - filledAmount;
          console.log("filledAmount", filledAmount);
          console.log("remainingAmount", remainingAmount);
        }else{
          filledAmount = 0;
          filledAmountOtherToken = 0;
          remainingAmount = readableTakerAmount;
        }
        let takerMinAmount;
        if(decodedTakerDataBids.tokenAddress == this.token.assetDataA.tokenAddress){
          let val = this.token.assetDataA.minAmount;
          console.log("val", val);
          
          takerMinAmount = val/exp;
        }
        if(decodedTakerDataBids.tokenAddress == this.token.assetDataB.tokenAddress){
          let val = this.token.assetDataB.minAmount;
          console.log("val???", val);
          
          takerMinAmount = val/exp;
        }
        let date = this.timestampFormats(response.bids.records[i].order.expirationTimeSeconds);
        console.log("takerminamount?",takerMinAmount);
        let makerData = {
          ...decodedMakerDataBids,
          symbol: makerSymbol
        }
        let takerData = {
          ...decodedTakerDataBids,
          symbol: takerSymbol,
          decimals: takerDecimals
        }
        let obj = {
          ...response.bids.records[i],
          makerData: makerData,
          takerData: takerData,
          priceTokenA: orderPriceA,
          priceTokenB: orderPriceB,
          makerAmount: redeableMakerAmount,
          expirationTimeSeconds: response.bids.records[i].order.expirationTimeSeconds.toNumber(),
          takerAmount: readableTakerAmount,
          filledAmount: filledAmount,
          filledAmountOtherToken: filledAmountOtherToken,
          remainingAmount: remainingAmount,
          minAmount: takerMinAmount,
          date: date
        }
        this.bids.push(obj);
      }
    }

    if(response.asks.total === 0 && response.bids.total === 0){
      //If null in both parts
      this.orderbook = {
        asks: this.asks,
        bids: this.bids
      }
      this.state.orders = {buys:[], sells:[]};
      //console.log("IF ASKS AND BIDS NULL ORDERBOOK",this.orderbook);

      if(this.loadingD != null){
        this.loadingD.close();
        this.loadingD = null;
      }
      this.setBuys(this.orderbook.asks);
      this.setSells(this.orderbook.bids);
      this.setShowOrders(this.orderbook.asks, this.orderbook.bids);
    }else{
      //checks if needs other call
      if(response.asks.total > (response.asks.page * response.asks.perPage) || response.bids.total > (response.bids.page * response.bids.perPage)){
        await this.getOrderbook(makerAssetData, takerAssetData, pageNumber+1);
      }else{
        //if don't needs do more calls
        //it must assign data correctly
        this.orderbook = {
          asks: this.asks,
          bids: this.bids
        }
        this.state.orders = {buys:[], sells:[]};

        if(((decodedMakerDataAsks != null && decodedMakerDataBids != null) && 
        (decodedMakerDataAsks.tokenAddress == this.token.assetDataB.tokenAddress && decodedMakerDataBids.tokenAddress == this.token.assetDataA.tokenAddress)) 
        || ((decodedMakerDataAsks == null && decodedMakerDataBids != null) && decodedMakerDataBids.tokenAddress == this.token.assetDataA.tokenAddress) 
        || ((decodedMakerDataAsks != null && decodedMakerDataBids == null) && decodedMakerDataAsks.tokenAddress == this.token.assetDataB.tokenAddress)){
            this.setBuys(this.orderbook.asks);
            this.setSells(this.orderbook.bids);
            this.setShowOrders(this.orderbook.asks, this.orderbook.bids); //buys, sells
        }
        if(((decodedMakerDataAsks != null && decodedMakerDataBids != null) &&
        (decodedMakerDataAsks.tokenAddress == this.token.assetDataA.tokenAddress && decodedMakerDataBids.tokenAddress == this.token.assetDataB.tokenAddress)) 
        || ((decodedMakerDataAsks == null && decodedMakerDataBids != null) && decodedMakerDataBids.tokenAddress == this.token.assetDataB.tokenAddress) 
        || ((decodedMakerDataAsks != null && decodedMakerDataBids == null) && decodedMakerDataAsks.tokenAddress == this.token.assetDataA.tokenAddress)){
          this.setBuys(this.orderbook.bids);
          this.setSells(this.orderbook.asks);
          this.setShowOrders(this.orderbook.bids, this.orderbook.asks);  //buys, sells
        }
        //closing loading dialog
        if(this.loadingD != null){
          this.loadingD.close();
          this.loadingD = null;
        }
        this.addOrdersToOrderWatcher(this.orderbook)
      }
    } 
  }

  setBuys(orders){
    console.log("BUYS orders",orders);
    
    this.state.orders.buys = orders;
    console.log("this.state.orders.buys.length",this.state.orders.buys.length);
    
  }

  setSells(orders){
    console.log("SELLS orders",orders);
    
    this.state.orders.sells = orders;
    console.log("this.state.orders.sells.length",this.state.orders.sells.length);
    
  }

  async setShowOrders(buys, sells){
    console.log("BUYS ZEROEX",buys);
    console.log("SELLS ZEROEX", sells);
    
		this.showBuys = buys;
		this.showSells = sells;
	}

  async addOrdersToOrderWatcher(orderbook){
    console.log("orderbook received!!!", orderbook);
    
    for (let i = 0; i < orderbook.asks.length; i++) {
      console.log("ASKS FOR");
      
      await this.orderWatcher.addOrderAsync(orderbook.asks[i].order);
      
    }
    for (let j = 0; j < orderbook.bids.length; j++) {
      console.log("BIDS FOR");
      
      await this.orderWatcher.addOrderAsync(orderbook.bids[j].order);
      
    }
    console.log("ORDER ASYNC ADDED????");
    //this.orderWatcher.subscribe();
    //this.orderWatcherInterval();
  }

  async orderWatcherInterval(){
    this.interval2 = setInterval(async()=>{
      let stats = this.orderWatcher.getStats();
      console.log(stats);
      
    }, 3000)
  }
  async startIntervalBalance(){
    //await this.getWethBalance();
    this.interval = setInterval(async ()=>{
      //await this.getWethBalance();
      await this.setBalances();
      await this.updateAllowance();
    },5000);
  }
  async startIntervalPairs(){
    
    this.interval2 = setInterval(async ()=>{
      //await this.getAssetPairs(1);
    },10000);
  }

  clearBalancesInterval(){
    if(this.interval != null){
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async getSymbol(token){
    let result;
    let abi;
    let callName;
    let type;
    try {
      result = await this._scan.getAbi(token);
    } catch (error) {
      console.log(error); 
    }
    console.log("getSymbol response _scan",result);
    
    if(result.status != "0"){
      let checkAbi = JSON.parse(result.result)
      for (let i = 0; i < checkAbi.length; i++) {
        if(checkAbi[i].name == 'symbol' || checkAbi[i].name == 'SYMBOL'){
          callName = checkAbi[i].name;
          type = checkAbi[i].outputs[0].type;
          abi = JSON.parse(result.result);
        }else{
          abi = require('human-standard-token-abi');
          callName = 'symbol'
        }
      }
    }else{
      abi = require('human-standard-token-abi');
      callName = 'symbol'
    }
    
    let contract = this._contract.contractInstance(abi, token);
    try {
      let symbol;
      let response = await this._contract.callFunction(contract, callName,[]);
      console.log("response first try getSymbol",response);
      
      if(type == "bytes32"){
        let toASCII = this._web3.web3.toAscii(response);
        console.log("inside bytes32, toASCII", toASCII);
        
        symbol = '';
        for (var i = 0; i < toASCII.length; i++) {
          if(toASCII.charCodeAt(i) != 0){
            symbol = symbol + toASCII[i];
          }
        }
      }else{
        symbol = response;
      }
      console.log("returned Symbol?????", symbol);
      
      return symbol;
    } catch (error) {
      console.log("SYMBOL CATCH!!!!!!");
      
      let contract = this._contract.contractInstance(this.abiBytes, token);
      let symbol; 
      let type;
      for (let i = 0; i < this.abiBytes.length; i++) {
        if(this.abiBytes[i].name == 'symbol'){
          type = this.abiBytes[i].outputs[0].type;
        }
      }
      try {
        let response = await this._contract.callFunction(contract, 'symbol', []);
        console.log("response del catch!!!!!", response);
        
        if(type == "bytes32"){
          let toASCII = this._web3.web3.toAscii(response);
          console.log("SYMBOL catch toASCII"), toASCII;
          
          symbol = '';
          for (var i = 0; i < toASCII.length; i++) {
            if(toASCII.charCodeAt(i) != 0){
              symbol = symbol + toASCII[i];
            }
          }
        }else{
          symbol = response;
        }
        console.log("Symbol response CATCH", symbol);
        
        return symbol; 
      } catch (error) {
        console.log("GET SYMBOL ERROR OF ERRROR!!!!!!!!!!!",error);
        return "SymbolError"
      }
    }
  }
  
  async getDecimals(token){
    let result;
    let abi;
    let callName;
    try {
      result = await this._scan.getAbi(token);
    } catch (error) {
      console.log(error);
      
    }
    console.log("getDecimals _scan result", result);
    
    if(result.status != "0"){
      let checkAbi = JSON.parse(result.result)
      for (let i = 0; i < checkAbi.length; i++) {
        if(checkAbi[i].name == 'decimals' || checkAbi[i].name == 'DECIMALS'){
          callName = checkAbi[i].name;
          abi = JSON.parse(result.result);
        }else{
          abi = require('human-standard-token-abi');
          callName = 'decimals'
        }
      }
    }else{
      abi = require('human-standard-token-abi');
      callName = 'decimals'
    }
    let contract = this._contract.contractInstance(abi, token);
    try {
      let decimals = await this._contract.callFunction(contract, callName,[]);
      return decimals;
    } catch (error) {
      console.log(error);
      return null;
    }
  }
  
  async depositWETH(amount){
    
    let value = Web3Wrapper.toBaseUnitAmount(new BigNumber(amount), this.DECIMALS);
    let contractAddr = await this.getContractAddresses();
    let WETHDepositTxHash = await this.contractWrappers.etherToken.depositAsync(
      contractAddr.etherToken,
      value,
      this._account.account.address.toLowerCase(),
    );
    await this.web3Wrapper.awaitTransactionSuccessAsync(WETHDepositTxHash);
    this.setBalances();
    console.log(this.token);
    console.log(contractAddr.etherToken);
    
    
  }

  async withdrawWETH(amount){
    let value = Web3Wrapper.toBaseUnitAmount(new BigNumber(amount), this.DECIMALS);
    let contractAddr = await this.getContractAddresses();
    let WETHWithdrawTxHash = await this.contractWrappers.etherToken.withdrawAsync(
      contractAddr.etherToken,
      value,
      this._account.account.address.toLowerCase(),
    );
    await this.web3Wrapper.awaitTransactionSuccessAsync(WETHWithdrawTxHash);
    this.setBalances();
  }
  
  async setUnlimitedProxyAllowance(contractAddr, addr){
    console.log("contractAddr", contractAddr);
    console.log("addr", addr);
    try {
      let ApprovalTxHash = await this.contractWrappers.erc20Token.setUnlimitedProxyAllowanceAsync(
        contractAddr,
        addr,
      );
      console.log("approvalTxHash", ApprovalTxHash);
      
      let x = await this.web3Wrapper.awaitTransactionSuccessAsync(ApprovalTxHash);
      console.log("after awaitTransactionSuccessAsync", x);
      
      return("done")  
    } catch (error) {
      console.log("ERROR SET UNLIMITED PROXY ALLOWANCE!!!!!!!!!!!!!!!!!!!");
      
    }
    
  }

  async getProxyAllowance(contractAddr, addr){
    try {
      let ApprovalTxHash = await this.contractWrappers.erc20Token.getProxyAllowanceAsync(
        contractAddr,
        addr,
      );
      //console.log("GET PROXY ALLOWANCE RESULT ERC20", ApprovalTxHash.toNumber());
      
      return ApprovalTxHash.toNumber()

    } catch (error) {
      let result;
      let abi;
      try {
        result = await this._scan.getAbi(contractAddr);
      } catch (error) { 
      }
      if(result.result == 'Contract source code not verified'){
        abi = require('human-standard-token-abi');
      }else{
        abi = JSON.parse(result.result)
      }
      let type;
      for (let i = 0; i < abi.length; i++) {
        if(abi[i].name == 'allowance'){
          type = abi[i].outputs[0].type;
        } 
      }
      let contract = this._contract.contractInstance(abi, contractAddr);
      try {
        let allowance;
        let response = await this._contract.callFunction(contract, 'allowance',[this._account.account.address, this.contractAddresses.erc20Proxy]);
        //console.log("response ALLOWANCE del first try",response);
        
        if(type == "bytes32"){
          let toASCII = this._web3.web3.toAscii(response);
          allowance = '';
          for (var i = 0; i < toASCII.length; i++) {
            if(toASCII.charCodeAt(i) != 0){
              allowance = allowance + toASCII[i];
            }
          }
        }else{
          allowance = response;
        }
        //console.log("ALLOWANCE before RETURN", allowance.toNumber());
        
        return allowance.toNumber();  
      } catch (error) {
        let contract = this._contract.contractInstance(this.abiBytes, contractAddr);
        let allowance; 
        let type;
        for (let i = 0; i < this.abiBytes.length; i++) {
          if(this.abiBytes[i].name == 'allowance'){
            type = this.abiBytes[i].outputs[0].type;
          }
        }
        try {
          let response = await this._contract.callFunction(contract, 'allowance', [this._account.account.address, this.contractAddresses.erc20Proxy]);
          //console.log("response ALLOWANCE second TRY this.abiBytes", response);
          
          if(type == "bytes32"){
            let toASCII = this._web3.web3.toAscii(response);
            allowance = '';
            for (var i = 0; i < toASCII.length; i++) {
              if(toASCII.charCodeAt(i) != 0){
                allowance = allowance + toASCII[i];
              }
            }
          }else{
            allowance = response;
          }
          //console.log("ALLOWANCE before RETURN", allowance.toNumber());
          
          return allowance.toNumber();
        } catch (error) {
          console.log("GET ALLOWANCE ERROR OF ERRROR!!!!!!!!!!!",error);
          return "Allowance error"
        }
      }  
    }
  }


  async getFeeRecipientsAsync(){
    return await this.httpClient.getFeeRecipientsAsync();
  }
  async getOrder(hash){
    console.log("hash sended to getORder?",hash);
    
    //String hash needed to get order
    return await this.httpClient.getOrderAsync(hash);
  }
  async getOrderConfig(orderConfigRequestObject){
    //OrderConfigRequest object needed to get orderConfig
    return await this.httpClient.getOrderConfigAsync(orderConfigRequestObject);
  }
  
  async getOrders(){
    console.log("this.httpsClient on getOrders Function",this.httpClient.getOrdersAsync({network: this._web3.network.chain}));
    
    return await this.httpClient.getOrdersAsync({network: this._web3.network.chain});
  }
  async submitOrder(SignedOrderObject){
    console.log("submitOrder",SignedOrderObject);
    
    //SignedOrder object needed to submit an order
    return await this.httpClient.submitOrderAsync(SignedOrderObject, { networkId: this._web3.network.chain});
  }
  async getAccounts(){
    //let web3Wrapper = new Web3Wrapper(this.providerEngine);
    let blockNumber = await this.web3Wrapper.getBlockNumberAsync();
    let accounts = await this.web3Wrapper.getAvailableAddressesAsync();
    console.log("accounts",accounts);
    console.log("blockNumber?",blockNumber);
  }

  getRandomFutureDateInSeconds = (num,type): BigNumber => {
    let value;
    let ONE_SECOND_MS = 1000;
    let ONE_MINUTE_MS = ONE_SECOND_MS * 60;
    let ONE_HOUR_MS = ONE_MINUTE_MS * 60;
    let ONE_DAY_MS = ONE_HOUR_MS * 24;
    
    if(type == 'minutes'){
      value = ONE_MINUTE_MS * num;
    }
    if(type == 'hours'){
      value = ONE_HOUR_MS * num;
    }
    if(type == 'days'){
      value = ONE_DAY_MS * num;
    }
    return new BigNumber(Date.now() + value).div(ONE_SECOND_MS).ceil();
  };
  
  async callFunction(contractInst, functionName:string, params){
		return await this._contract.callFunction(contractInst, functionName, params);
	}
  async getContractAddresses(){
    return getContractAddressesForNetworkOrThrow(this._web3.network.chain);
  }

  async setToken(token?) {
    
    if(typeof(token)!="undefined"){
      console.log("token?",token);
    }
    if(this.loadingD == null){
      this.activateLoading();
    }
    console.log("SET TOKEN FUNCTION??????!?!?!?");
    
		if(this.state.orders != null){
			this.state.orders.buys = null;
			this.state.orders.sells = null;
      this.state.orders = null;
    }
    
		//if(this.activeOrdersInterval != null){
			//await this.clearActiveOrdersInterval();
		//}
		
		if(typeof(token) == "undefined"){
      let localToken = this.getLocalStorageToken();
      let localToken_inArray = this.in_Array(localToken, this.asset_pairs)
			if(localToken_inArray != false) {
        this.token = localToken;
        //this.updateAllowance();
			} else {
        let default_config_inArray = this.in_Array(this.config.default_token, this.asset_pairs);
        
        if(default_config_inArray != false){
          this.token = default_config_inArray;
        }else{
          if(this.asset_pairs.length > 0){
            this.token = this.asset_pairs[0];
          }else{
            this.token = []
          }
        }
			}
		}else{
			this.token = token;
		}
		console.log("this.token", this.token);
    
    await this.updateTokenInfo();
		this.saveLocalStorageToken();
    
    
		//this.getTokenState();
		
    this.startIntervalBalance();
    this.startIntervalPairs();

    console.log("THIS TOKEN AFTER SET TOKEN!!!!!!!", this.token);
    
    this.getOrderbook(this.token.assetDataA.assetData, this.token.assetDataB.assetData, 1);
    
  }
  async updateTokenInfo(){
    try {
      console.log("CHECKING ALLOWANCE");  
      this.token.assetDataA.allowed = await this.getProxyAllowance(this.token.assetDataA.tokenAddress, this._account.account.address);
      
    } catch (error) {
      this.token.assetDataA.allowed = 0;
      console.log("ALLOWANCE A ERROR");
      
    }

    try {  
      console.log("CHECKING ALLOWANCE");
      this.token.assetDataB.allowed = await this.getProxyAllowance(this.token.assetDataB.tokenAddress, this._account.account.address);
    
    } catch (error) {
      this.token.assetDataB.allowed = 0; 
      console.log("ALLOWANCE B ERROR");
      
    }
    await this.setBalances();
  }


  getLocalStorageToken(){
		if(localStorage.getItem('0xToken')){
			return JSON.parse(localStorage.getItem('0xToken'));
		}else{
			return null;
    }
  }

  removeLocalStorageToken(){
    if(localStorage.getItem('0xToken')){
      localStorage.removeItem('0xToken');
    }
  }
  
  saveLocalStorageToken(){
		if(this.token != null){
      localStorage.removeItem('0xToken');
			localStorage.setItem('0xToken', JSON.stringify(this.token));
			
		}else{
			localStorage.removeItem('0xToken');	
		}
  }

  resetTokenBalances() {
		this.token.assetDataA.balance = null;
    this.token.assetDataB.balance = null;
  }
  
  async setBalances() {
		this.token.assetDataA.balance = await this.getBalance(this.token.assetDataA);
    this.token.assetDataB.balance = await this.getBalance(this.token.assetDataB);
    //console.log("log this tokens inside setBalances",this.token);
    console.log("balance A", this.token.assetDataA.balance, this.token.assetDataA.name);
    console.log("balance B", this.token.assetDataB.balance, this.token.assetDataB.name);
  
  }

  async updateAllowance(){
    try {
      this.token.assetDataA.allowed = await this.getProxyAllowance(this.token.assetDataA.tokenAddress, this._account.account.address);;  
    } catch (error) {
      console.log("UPDATE ALLOWANCE TOKEN A ERROR", error);
      
    }
    
    try {
      this.token.assetDataB.allowed = await this.getProxyAllowance(this.token.assetDataB.tokenAddress, this._account.account.address);;  
    } catch (error) {
      console.log("UPDATE ALLOWANCE TOKEN B ERROR", error);
      
    }
    
  }

  async getBalance(token) {
    let balance:number = 0;
    let result;
    let abi;
    
    
    try {
      result = await this._scan.getAbi(token.tokenAddress);
    } catch (error) {
       
    }
    if(result.status != "0"){
      let checkAbi = JSON.parse(result.result)
      for (let i = 0; i < checkAbi.length; i++) {
        if(checkAbi[i].name == 'balanceOf'){
          abi = JSON.parse(result.result);
        }else{
          abi = require('human-standard-token-abi');
        }
      }
    }else{
      abi = require('human-standard-token-abi');
    }
    let contract = this._contract.contractInstance(abi, token.tokenAddress);
    if(contract != null){
      let value;
      try {
        value = await this._contract.callFunction(contract, 'balanceOf', [this._account.account.address]);
      } catch (error) {
        console.log("error call balanceof",error);
        this.getBalance(token);
      }

      let x = value.toString();
      let resBig = new BigNumber(x);
      let y;
      if(token.decimals != null){
        y = resBig.div(Math.pow(10,token.decimals));
      }else{
        y = resBig.div(Math.pow(10,18));
      }
      balance = y.toNumber(); 
    }		
		return balance;
  }
  
  activateLoading(){
		Promise.resolve().then(() => {
		  this.loadingD = this.dialog.open(LoadingDialogComponent, {
			width: '660px',
			height: '150px',
			disableClose: true,
		  });
		});
  }
  
}