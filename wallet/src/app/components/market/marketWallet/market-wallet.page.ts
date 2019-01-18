import { Component, OnInit, OnDestroy, DoCheck } from '@angular/core';
import { MdDialog } from '@angular/material';

import { AccountService } from '../../../services/account.service';
import { LSCXMarketService } from '../../../services/LSCX-market.service';
import { EtherscanService } from '../../../services/etherscan.service';
import { ZeroExService } from "../../../services/0x.service";
import { DialogService } from "../../../services/dialog.service";
import { Web3 } from "../../../services/web3.service";
import { ContractService } from "../../../services/contract.service";

import { MarketComponent } from "../market.component";
import { WrapUnwrapDialogComponent } from "../../dialogs/wrap-unwrap.component";

import { RawTx } from '../../../models/rawtx';

import BigNumber from 'bignumber.js';
@Component({
  selector: 'app-market-wallet',
  templateUrl: './market-wallet.page.html',
})

export class MarketWalletPage implements OnInit, OnDestroy, DoCheck {
  action : string;
  actionNameA:string;
  actionNameB:string;
  interval;
  dialogRef;
  constructor(private _contract : ContractService, private _web3: Web3, public _account:AccountService, public dialogService : DialogService, public dialog: MdDialog, protected _LSCXmarket: LSCXMarketService, private _scan: EtherscanService, public _marketComponent : MarketComponent, protected _zeroEx: ZeroExService ) {
    this.action = 'deposit';
    if(this.action == 'deposit' && this._marketComponent.display=='weth' && this._zeroEx.token.assetDataA.tokenAddress != this._zeroEx.contractAddresses.etherToken && this._zeroEx.token.assetDataA.allowed == 0){
      this.actionNameA = 'allow';
    }else{
      this.actionNameA = this.action;
      if(this.action == 'deposit' && this._marketComponent.display =='weth' && this._zeroEx.token.assetDataA.tokenAddress != this._zeroEx.contractAddresses.etherToken && this._zeroEx.token.assetDataA.allowed > 0){
        this.actionNameA = 'override allowance';
      }
    }
    if(this.action == 'deposit' && this._marketComponent.display=='weth' && this._zeroEx.token.assetDataB.tokenAddress != this._zeroEx.contractAddresses.etherToken && this._zeroEx.token.assetDataB.allowed == 0){
      this.actionNameB = 'allow';
    }else{
      this.actionNameB = this.action;
      if(this.action == 'deposit' && this._marketComponent.display=='weth' && this._zeroEx.token.assetDataB.tokenAddress != this._zeroEx.contractAddresses.etherToken && this._zeroEx.token.assetDataB.allowed > 0){
        this.actionNameB = 'override allowance';
      }

    }
    console.log("acc balance", _account.account.balance);
    //console.log("0x balance", _zeroEx.balance_weth);
  }
  async ngOnInit() {
    await this._LSCXmarket.setBalancesInterval();
  }

  ngOnDestroy(){
    this._LSCXmarket.clearBalancesInterval();
  }
  ngDoCheck(){
    this.activeButton(this.action)  
  }
  
  activeButton(action){   
    this.action = action;
    if(this.action == 'deposit' && this._marketComponent.display=='weth' && this._zeroEx.token.assetDataA.tokenAddress != this._zeroEx.contractAddresses.etherToken && this._zeroEx.token.assetDataA.allowed == 0){
      this.actionNameA = 'allow';
    }else{
      this.actionNameA = this.action;
      if(this.action == 'deposit' && this._marketComponent.display =='weth' && this._zeroEx.token.assetDataA.tokenAddress != this._zeroEx.contractAddresses.etherToken && this._zeroEx.token.assetDataA.allowed > 0){
        this.actionNameA = 'override allowance';
      }
    }
    if(this.action == 'deposit' && this._marketComponent.display=='weth' && this._zeroEx.token.assetDataB.tokenAddress != this._zeroEx.contractAddresses.etherToken && this._zeroEx.token.assetDataB.allowed == 0){
      this.actionNameB = 'allow';
    }else{
      this.actionNameB = this.action;
      if(this.action == 'deposit' && this._marketComponent.display=='weth' && this._zeroEx.token.assetDataB.tokenAddress != this._zeroEx.contractAddresses.etherToken && this._zeroEx.token.assetDataB.allowed > 0){
        this.actionNameB = 'override allowance';
      }

    }
  }
  openExternal(){
    if(this._marketComponent.display == 'eth'){
      this._scan.openTokenUrl(this._LSCXmarket.token.addr)
    }
    if(this._marketComponent.display == 'weth'){
      this._scan.openTokenUrl(this._zeroEx.token.assetDataA.tokenAddress)
      this._scan.openTokenUrl(this._zeroEx.token.assetDataB.tokenAddress)
    }
  }
}
