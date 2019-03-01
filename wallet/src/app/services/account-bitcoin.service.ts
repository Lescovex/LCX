import { Injectable} from '@angular/core';
import { Http } from '@angular/http';
import 'rxjs/add/operator/map';
import { Observable } from 'rxjs/Observable';
import { Router } from '@angular/router';
import { MdDialog } from '@angular/material';
import { LoadingDialogComponent } from '../components/dialogs/loading-dialog.component';

import { BitcoinWalletService } from './wallet-bitcoin.service';
import { DialogService } from "./dialog.service";
import { ERROR_LOGGER } from '../../../node_modules/@angular/core/src/errors';

const classify = require('bitcoinjs-lib/src/classify')

var bitcoin = require("bitcoinjs-lib");
var ElectrumCli = require('electrum-client');


@Injectable()
export class BitcoinAccountService{
  account : any = {};
  pending: Array<any> = [];
  events : Array<any> = [];
  marginCalls : Array<any> = [];
  interval;
  loadingD;
  block;
  public moment = require('moment');
  public config;
  public configFile;
  serverError;
  constructor(private dialog: MdDialog, private http: Http, private _wallet : BitcoinWalletService, private router: Router, public _dialog : DialogService){
    this.configFile = require("../../libs/btc/config.json");
    this.checkServer();
  }

  async setAccount(account){
    this.loadingD = this.dialog.open(LoadingDialogComponent, {
      width: '660px',
      height: '150px',
      disableClose: true,
    });
    if('address' in this.account && typeof(this.account.address)!= "undefined"){
      await clearInterval(this.interval)
    }
      if(typeof(this.account.address) != "undefined"){
        await clearInterval(this.interval)
      }
      this.account = account;
      localStorage.setItem('accBTC',JSON.stringify(account.address));
      //await this.getPendingTx();
      this.account.history = null;
      await this.startIntervalData();
  
    
  }

  refreshAccount(){
    localStorage.removeItem('accBTC');
    this.getAccountData();
    if(typeof(this.account.address) == "undefined"){
      clearInterval(this.interval)
    }
    //this.router.navigate(['/btcwallet/btcglobal']);
  }

  getAccount(){
    let acc:any = {};
    if(localStorage.getItem('accBTC') &&  localStorage.getItem('accBTC')!= 'undefined'){
      let addr = JSON.parse(localStorage.getItem('accBTC'));
      acc = this._wallet.getAccount(addr);
    }else if(this._wallet.wallet !== null && this._wallet.wallet.length >0){
      acc = this._wallet.wallet[0];
      localStorage.setItem('accBTC', JSON.stringify(acc.address));
    }else{
      acc = {};
    }
    if(localStorage.getItem('accBTC') == 'undefined'){
      localStorage.removeItem('accBTC');
    }
    return acc;
  }

  async setData(){
    
    let addr = this.account.address;
    let self= this;
    let script = bitcoin.address.toOutputScript(addr)
    let hash = bitcoin.crypto.sha256(script)
    let reversedHash = new Buffer(hash.reverse())
    let scripthash  = reversedHash.toString('hex');

    try {

      const ecl = new ElectrumCli(this.config.port, this.config.url, 'tcp');

      try {
        await ecl.connect();  
      } catch (error) {
        console.log("setData error", error);
        
      }
      const ver = await ecl.server_version("1.8.12","1.4");

      
      let prevBalance = await ecl.blockchainScripthash_getBalance(scripthash);
      
      self.account.balance = prevBalance.confirmed;
      let data = await ecl.blockchainScripthash_getHistory(scripthash);
      
      let x;
      let net = bitcoin.networks.bitcoin;
      
      let history = new Array();
      
      for (let index = 0; index < data.length; index++) {
        if(data[index].height != 0){
          x = await ecl.blockchainTransaction_get(data[index].tx_hash, data[index].height);
          
          var tx = bitcoin.Transaction.fromHex(x);
          
          var currentBlock = await ecl.blockchainHeaders_subscribe()
          
          this.block = currentBlock.height;
          var header = await ecl.blockchainBlock_getHeader(data[index].height);
          
          let objTime = await this.timestampFormats(header.timestamp);
          let obj ={
            format : this.decodeFormat(tx),
            inputs: this.decodeInput(tx),
            outputs: this.decodeOutput(tx, net),
            timestamp: header.timestamp,
            date: objTime.date,
            month: objTime.month,
            day: objTime.day,
            fullDate: objTime.fullDate,
            countdown: objTime.countdown,
            height: header.block_height,
            confirmations: this.block - data[index].height,
            balance:null
          }
          
          let ref = index-1;
            if(ref >= 0){
              try {
                if(obj.outputs[0].scriptPubKey.addresses[0] == this.account.address){
                  
                  let y = await ecl.blockchainTransaction_get(data[index-1].tx_hash, data[index-1].height);
                  let prevtx = bitcoin.Transaction.fromHex(y);
                  let prevOut =  this.decodeOutput(prevtx, net);
                  if(prevOut[1].scriptPubKey.addresses[0] == this.account.address){
                      obj.balance = prevOut[1].satoshi - obj.outputs[0].satoshi;        
                  }else{
                      obj.balance = prevOut[0].satoshi - obj.outputs[0].satoshi;
                  }
              }else{
                if(obj.outputs[1].scriptPubKey.addresses[0] == this.account.address){
                    obj.balance = obj.outputs[1].satoshi;
                }else{
                    if(obj.outputs[0].scriptPubKey.addresses[0] == this.account.address){
                        obj.balance = obj.outputs[0].satoshi;
                    }
                }

              }
              } catch (error) {
                //this.account.history = null;
                //history = null;
                console.log(error);
                
              }
            }else{              
                if(obj.outputs[1].scriptPubKey.addresses[0] == this.account.address){  
                    obj.balance = obj.outputs[1].satoshi;
                }else{
                    if(obj.outputs[0].scriptPubKey.addresses[0] == this.account.address){
                        obj.balance = obj.outputs[0].satoshi;
                    }
                }
            }
        
          history.push(obj);
          }else{
            x = await ecl.blockchainTransaction_get(data[index].tx_hash, data[index].height);
            var tx = bitcoin.Transaction.fromHex(x);
            
            var currentBlock = await ecl.blockchainHeaders_subscribe()
            
            this.block = currentBlock.height;
            var header = await ecl.blockchainBlock_getHeader(data[index].height);
            
            let obj ={
              format : this.decodeFormat(tx),
              inputs: this.decodeInput(tx),
              outputs: this.decodeOutput(tx, net),
              timestamp: "-",
              date: "-",
              month: "",
              day: "-",
              fullDate: "-",
              countdown: "Pending...",
              height: "-",
              confirmations: "-",
              balance: null
            }
            let ref = index-1;
            if(ref >= 0){
              if(obj.outputs[0].scriptPubKey.addresses[0] == this.account.address){
                  let y = await ecl.blockchainTransaction_get(data[index-1].tx_hash, data[index-1].height);
                  let prevtx = bitcoin.Transaction.fromHex(y);
                  let prevOut =  this.decodeOutput(prevtx, net);
                  if(prevOut[1].scriptPubKey.addresses[0] == this.account.address){
                      obj.balance = prevOut[1].satoshi - obj.outputs[0].satoshi;        
                  }else{
                      if(prevOut[0].satoshi - obj.outputs[0].satoshi > 0){
                        obj.balance = prevOut[0].satoshi - obj.outputs[0].satoshi;
                      }else{
                        let check = true;
                        let pointer = 2;
                        let z;
                        let prev;
                        let prevO;
                        while(check == true){
                          z = await ecl.blockchainTransaction_get(data[index-pointer].tx_hash, data[index-pointer].height);
                          prev = bitcoin.Transaction.fromHex(z);
                          prevO = this.decodeOutput(prev, net);
                          if(prevO[0].satoshi - obj.outputs[0].satoshi > 0){
                            obj.balance = prevO[0].satoshi - obj.outputs[0].satoshi;
                            check = false;
                          }else{
                            pointer = pointer + 1;

                          }
                        }
                      }
                  }
              }else{
                  if(obj.outputs[1].scriptPubKey.addresses[0] == this.account.address){
                      obj.balance = obj.outputs[1].satoshi;
                  }else{  
                      if(obj.outputs[0].scriptPubKey.addresses[0] == this.account.address){
                          obj.balance = obj.outputs[0].satoshi;
                      }
                  }
              }
          }else{
              if(obj.outputs[1].scriptPubKey.addresses[0] == this.account.address){
                  obj.balance = obj.outputs[1].satoshi;
              }else{  
                  if(obj.outputs[0].scriptPubKey.addresses[0] == this.account.address){
                      obj.balance = obj.outputs[0].satoshi;
                  }
              }
          }
          history.push(obj);
          }
        
      }
      history = history.reverse();
      
      this.account.history = history;
      if(this.loadingD != null){
        this.loadingD.close();
      }
      this.removePendingTx();      
    } catch (error) {
      //console.log(error);
    }
    
  }

  async checkServer(){
    let load;
    let index = 0;
    Promise.resolve().then(() => { 
      load = this._dialog.openLoadingDialog();  
    });
    while (index < this.configFile.servers.length) {
      try {
        const ecl = new ElectrumCli(this.configFile.servers[index].port, this.configFile.servers[index].url, 'tcp');
        await ecl.connect();
        await load.close();
        this.config = this.configFile.servers[index];
        if(this.serverError != null){
          this.serverError = null;
        }
        this.getAccountData();
        index = this.configFile.servers.length +1;
      } catch (error) {
        index = index + 1;
        if(index == this.configFile.servers.length){
          let title = 'Unable to connect to BTC server';
          let message = 'Something was wrong';
          load.close();
          let dialogRef = this._dialog.openErrorDialog(title, message, error);
          clearInterval(this.interval);
          this.serverError = "Unable to connect to BTC server";
          throw new Error(error);
        }
      }
    }
  }

  async getAccountData(){
    try {
    const ecl = new ElectrumCli(this.config.port, this.config.url, 'tcp');
    await ecl.connect();
    this.serverError = null;
    } catch (error) {
      let title = 'Unable to connect to BTC server';
      let message = 'Something was wrong';
      let dialogRef = this._dialog.openErrorDialog(title, message, error);
      clearInterval(this.interval);
      this.serverError = "Unable to connect to BTC server";
      throw new Error(error);
    }

    this.account = this.getAccount();
    console.log("this.account",this.account);
    if(localStorage.getItem('accBTC')){
      
      await this.setAccount(this.account);
      await this.getAccountsBalances();

      if(Object.keys(this.account).length != 0){
        this.getPendingTx();
        await this.setData();
      }
    }
    
  }

  getPendingTx(){
    if(localStorage.getItem('btcAcc')){
      let wallet = JSON.parse(localStorage.getItem('btcAcc'));
      let result = wallet.findIndex(x => x.address == this.account.address);
      if(wallet[result].hasOwnProperty('pending')){
        this.pending= wallet[result].pending;
      }
    }
  }

  async getAccountsBalances(){
    let addr;
    let script;
    let hash;
    let reversedHash;
    let scripthash;
    let ecl;
    let ver;
    let prevBalance;
    if(localStorage.getItem('btcAcc')){
      let storage = JSON.parse(localStorage.getItem('btcAcc'));
      for (let i = 0; i < storage.length; i++) {
        addr = storage[i].address;
        //storage[i].address
        script = bitcoin.address.toOutputScript(storage[i].address)
        hash = bitcoin.crypto.sha256(script)
        reversedHash = new Buffer(hash.reverse())
        scripthash  = reversedHash.toString('hex');
        
        ecl = new ElectrumCli(this.config.port, this.config.url, 'tcp');
        
        try {
          await ecl.connect();  
        } catch (error) {
          console.log("getAccountBalancesError",error);
          
        }
        
        ver = await ecl.server_version("1.8.12","1.4");
        prevBalance = await ecl.blockchainScripthash_getBalance(scripthash);
        
        if(prevBalance == null){
          prevBalance = 0;
        }
        
        storage[i].balance = prevBalance.confirmed;
        
      }
      localStorage.setItem('btcAcc',JSON.stringify(storage));
    }
  }
  
  addPendingTx(tx){
    this.pending.push(tx);
    if(localStorage.getItem('btcAcc')){
      let wallet = JSON.parse(localStorage.getItem('btcAcc'));
      let result = wallet.findIndex(x => x.address == this.account.address);
      wallet[result].pending = this.pending;
      localStorage.setItem('btcAcc',JSON.stringify(wallet));
    }
    this.setData();
  }

  removePendingTx(){
    let wallet = JSON.parse(localStorage.getItem('btcAcc'));
    let result = wallet.findIndex(x => x.address == this.account.address);
    wallet[result].pending = this.pending;
    localStorage.setItem('btcAcc',JSON.stringify(wallet));
  }

  async startIntervalData(){
    this.setData();
    if(this.loadingD != null){
        this.loadingD.close();
    }
    this.interval = setInterval(async()=>{
      await this.setData();
    },10000); 
      
  }
  
  decodeFormat(tx){
    var result = {
        txid: tx.getId(),
        version: tx.version,
        locktime: tx.locktime,
    };
    return result;
  }

  decodeInput(tx){
      var result = [];
      tx.ins.forEach(function(input, n){
          var vin = {
              txid: input.hash.reverse().toString('hex'),
              n : input.index,
              script: bitcoin.script.toASM(input.script),
              sequence: input.sequence,
          }
          result.push(vin);
      })
      return result
  }

  decodeOutput(tx, network){
      var format = function(out, n, network){
          var vout = {
              satoshi: out.value,
              value: (1e-8 * out.value).toFixed(8),
              n: n,
              scriptPubKey: {
                  asm: bitcoin.script.toASM(out.script),
                  hex: out.script.toString('hex'),
                  type: classify.output(out.script),
                  addresses: [],
              },
          };
          switch(vout.scriptPubKey.type){
          case 'pubkeyhash':
          case 'scripthash':
              vout.scriptPubKey.addresses.push(bitcoin.address.fromOutputScript(out.script, network));
              break;
          }
          return vout
      }

      var result = [];
      tx.outs.forEach(function(out, n){
          result.push(format(out, n, network));
      })
      return result
  }

  timestampFormats(unix_tm){
    let dt = new Date(parseInt(unix_tm)*1000);
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