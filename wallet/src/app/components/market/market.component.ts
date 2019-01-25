import { Component, OnDestroy, DoCheck } from '@angular/core';
import { AccountService } from '../../services/account.service';
import { LSCXMarketService } from '../../services/LSCX-market.service';
import { Web3 } from '../../services/web3.service';

import { ZeroExService } from "../../services/0x.service";

@Component({
  selector: 'app-market',
  templateUrl: './market.component.html',
})
export class MarketComponent implements DoCheck, OnDestroy{
  protected showList: boolean = false;
  protected price;
  protected interval;
  protected net;
  public display;

  constructor(public _account:AccountService, public _LSCXmarket: LSCXMarketService, private _web3: Web3, public _zeroEx: ZeroExService) {
    this.display = "eth";
    this._zeroEx.display = this.display;
    this._LSCXmarket.updateMyStateShow("myFunds");
    this._LSCXmarket.updateMyStateShow("myOrders");
    this._LSCXmarket.updateMyStateShow("myTrades");
    this._LSCXmarket.setTikersInterval();
    this.net = this._web3.network.chain;
    //this._0x.provider();
  }


  ngOnInit(){
    console.log("market component on init???");
    
  }
  print(text){
    console.log("where i click?", text)
  }
  ngDoCheck(){
    this._zeroEx.display = this.display;
    
     if(this._LSCXmarket.updated = true && this._LSCXmarket.tikersInterval == null){
       this._LSCXmarket.setTikersInterval();
     }
     if(this.net != this._web3.network.chain){
        //this._0x.provider();
        this.net = this._web3.network.chain;
     }
     
  }
  
  ngOnDestroy(){
    this._LSCXmarket.clearTikersInterval();
  }

  maxHeight() {
    var mainContent = document.getElementsByClassName('main-content')[0];
    return mainContent.getBoundingClientRect().height-110;
  }

  toggleList() {
    this.showList = !this.showList
  }

  onSelect(show:boolean) {
    this.showList = show;
    this.price = 0;
  }

  toggleShow() {
    this.showList = ! this.showList;
  }

  changeDisplay(){
    if(this.display == "eth"){
      this.display = "weth";
      this._zeroEx.display = this.display;
    }else{
      this.display = "eth";
      this._zeroEx.display = this.display;
    }
  }
}