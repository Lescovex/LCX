import { Component,  Inject, } from '@angular/core';
import { MdDialogRef, MdDialog, MD_DIALOG_DATA} from '@angular/material';

import { Web3 } from '../../../services/web3.service';
import { DialogService } from '../../../services/dialog.service';
import { LSCXMarketService } from '../../../services/LSCX-market.service';
import { AccountService } from '../../../services/account.service';
import { SendDialogService } from '../../../services/send-dialog.service';
import { ContractService } from '../../../services/contract.service';

import { SendMarketDialogComponent } from '../../dialogs/send-market-dialog.component';
import { GasDialogComponent } from '../../dialogs/gas-dialog.component';
import { LoadingDialogComponent } from '../../dialogs/loading-dialog.component';
import { ErrorDialogComponent } from '../../dialogs/error-dialog.component';

import { RawTx } from '../../../models/rawtx';
import BigNumber from 'bignumber.js';
import { Trade } from '../../../models/trade';
import { Order } from '../../../models/order';
@Component({
    selector: 'order-dialog',
    templateUrl: './order-dialog.component.html'
})

export class OrderDialogComponent {
    submited = false;
    totalSumbit = false;
   
    protected action: string;
    f: any = {
      amount : undefined,
      price : undefined,
      total: 0,
      expires : 10000
    }
    private tokenAmount:number;
    private ethAmount: number;
    private amount: number;
    private loadingDialog;
    protected bestSell;
    protected bestBuy

    constructor(@Inject(MD_DIALOG_DATA) public data: any,private _contract: ContractService, private dialog: MdDialog, private _account: AccountService, private _LSCXmarket: LSCXMarketService,  public dialogRef: MdDialogRef<OrderDialogComponent>, private _web3: Web3, private _dialog: DialogService, private sendDialogService: SendDialogService){
        console.log("data????",data);
        this.f.price = data.price;
        if(this.data.action == "buy"){
            this.action = "sell";
        }
        if(this.data.action == "sell"){
            this.action = "buy"
        }
    }
    closeDialog(){
        this.dialogRef.close();
    }

    async confirm(form){
        this.submited = true;
        if(form.invalid) return false;
        this.loadingDialog = this._dialog.openLoadingDialog();
        let price =new BigNumber(this.f.price);
        
        this.tokenAmount = this.f.amount*Math.pow(10,this._LSCXmarket.token.decimals);
        this.ethAmount = Math.floor(this.f.total*Math.pow(10,18));
        
        this.amount = (this.action == 'buy')? this.ethAmount : this.tokenAmount;
            //change to > to get total
        if(this.action == "buy" && this.f.total > this._LSCXmarket.marketBalances.eth || this.action == "sell" && this.f.amount > this._LSCXmarket.marketBalances.token){
            this.loadingDialog.close();
            //calculate market fee, if buy you'll need f.total + feeMarket
            if(this.action=="buy"){
            let dialogRef = this._dialog.openErrorDialog('Unable to send this order', "You don't have enough funds. Please DEPOSIT first using the Deposit form in the market wallet tab.", " ");
            }
            if(this.action =="sell"){
            let dialogRef = this._dialog.openErrorDialog('Unable to send this order', "You don't have enough funds. Please DEPOSIT first using the Deposit form in the market wallet tab.", " ");
            }

            return false
        }
        
        let amountCross = (this.action == 'buy')? this.f.total : this.f.amount;
        
        let matchs = await this.getCross(amountCross, this.f.price);
        
        if(matchs.length > 0){
            let testTrade = false;
            let params = [];
            let order: any;
        
            
            order = this.data;
            
            let testParams = [order.tokenGet, order.amountGet, order.tokenGive, order.amountGive, order.expires, order.nonce, order.user,  this.f.amount, this._account.account.address];
            let testTradeResp = await this._contract.callFunction(this._LSCXmarket.contractMarket,'testTrade',testParams);
            testTrade = (testTradeResp.toString() == "true")? true: false;
            
            if(testTrade) params = [order.tokenGet,order.amountGet, order.tokenGive, order.amountGive, order.expires, order.nonce, order.user, this.amount];
            

            if(params.length > 0){
                this.trade(params, order);
            }
            this.dialogRef.close();
        }
    }

    total() {
        let total = this.f.amount * this.f.price;
        
        if(this.data.action == "sell"){
            if(total > this.data.available){
                this.totalSumbit = true;
                this.submited = true;
                this.f.total = 0;
                return false;
            }else{
                this.f.total = (isNaN(total))? 0 : this.f.amount * this.f.price;
            }
        }
        if(this.data.action == "buy"){
            if(this.f.amount > this.data.available){
                this.totalSumbit = true;
                this.submited = true;
                this.f.total = 0;
                return false
            }else{
                this.f.total = (isNaN(total))? 0 : this.f.amount * this.f.price;
            }
        }
      }

      async getCross(amount, price){
        let blockNumber = await this._web3.blockNumber();
        let ordersToCross =[];
        if(this.action == 'buy'){
          ordersToCross = this._LSCXmarket.state.orders.sells;
        }else{
          ordersToCross = this._LSCXmarket.state.orders.buys;
        }    
        return ordersToCross.filter(x=>{ return x.available>=amount && parseFloat(x.price)==price && x.expires>blockNumber && x.user.toLowerCase() !=this._account.account.address.toLowerCase()});
      }

      async trade(params, order){
          let data = await this._LSCXmarket.getFunctionData(this._LSCXmarket.contractMarket,'trade',params);  
          this.loadingDialog.close();
          let gasLimit;
          try{
            gasLimit = await this._web3.estimateGas(this._account.account.address, this._LSCXmarket.contractMarket.address, data, 0);
          }catch(e){
            gasLimit = this._LSCXmarket.config.gasTrade;
          }
  
          let gasOpt = await this.openGasDialog(gasLimit);
  
          if(gasOpt != null){
            let nonce = await this.getNonce(); 
            let tx = new RawTx(this._account,this._LSCXmarket.contractMarket.address,new BigNumber(0),gasOpt.gasLimit, gasOpt.gasPrice, this._web3.network, data);
            let tradeObj = new Trade(this.action, order.tokenGet, order.tokenGive, this.f.amount, this.f.total, this.f.price, this._account.account.address, order.user, nonce, params[7]);             
            let fees = this.getFees("trade");
            let tokenName = (this.action == "buy")? "ETH": this._LSCXmarket.token.name;
            this.sendDialogService.openConfirmMarketOrders(tx.tx, this._LSCXmarket.contractMarket.address, tx.amount, tx.gas, tx.cost, "send", "myTrades", tradeObj, fees, tokenName);
          }  
      }
  
      async openGasDialog(gasLimit){
        let dialogRef = this._dialog.openGasDialog(gasLimit, 1);
        let result = await dialogRef.afterClosed().toPromise();
        
        if(typeof(result) != 'undefined'){
            let obj = JSON.parse(result);
            return obj;
        }
        return null;
    }
  
    async getNonce(){
      let nonce = await this._web3.getNonce(this._account.account.address);
      //para ver ultimo nonce real
      let history = this._account.account.history.filter(x=> x.from.toLowerCase() ==this._account.account.address);
      let historyNonce = history[0].nonce;
      
      if(historyNonce>= nonce){
          nonce = parseInt(historyNonce)+1;
      }
      return nonce;
    }
  
    getFees(typeOrder): number{
      let eth = parseInt(this._web3.web3.toWei(1, "ether"));
      let fees = 0;
      if(typeOrder=="order") {
        let amount = (this.action == "buy")? this.tokenAmount : this.ethAmount;
        fees = (amount*this._LSCXmarket.fees.feeMake)/eth;
        
      } else {
        fees = (this.amount*this._LSCXmarket.fees.feeTake)/eth;
      }
      if(this.action == "buy" && typeOrder == "trade" || this.action == "sell" && typeOrder == "order" ) {
        fees = fees/Math.pow(10,18);
      } else {
        fees = fees/Math.pow(10,this._LSCXmarket.token.decimals);
      }
      return fees;
    }
}