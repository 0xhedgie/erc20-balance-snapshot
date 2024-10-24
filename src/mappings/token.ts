import { BigDecimal, Bytes, ethereum } from '@graphprotocol/graph-ts'

import { ERC20, Transfer } from '../../generated/StandardToken/ERC20'
import { Token } from '../../generated/schema'

import { toDecimal, ONE, ZERO } from '../helpers/number'
import {
  decreaseAccountBalance,
  getOrCreateAccount,
  increaseAccountBalance,
  saveAccountBalanceSnapshot,
} from './account'

const GENESIS_ADDRESS = '0x0000000000000000000000000000000000000000'

export function fetchTokenDetails(event: ethereum.Event): Token | null {
  //check if token details are already saved
  let token = Token.load(event.address.toHex());
  if (!token) {
    // If token details are not available, create a new token
    token = new Token(event.address.toHex());

    //set the address field
    token.address = event.address;

    //set some default values
    token.name = "N/A";
    token.symbol = "N/A";
    token.decimals = 0;
    token.eventCount = ZERO; // Initialize eventCount
    token.burnEventCount = ZERO; // Initialize eventCount
    token.mintEventCount = ZERO; // Initialize eventCount
    token.transferEventCount = ZERO;
    token.holderCount = ZERO;
    token.totalSupply = BigDecimal.fromString('0');
    token.totalBurned = BigDecimal.fromString('0');
    token.totalMinted = BigDecimal.fromString('0');
    token.totalTransferred = BigDecimal.fromString('0');

    //bind the contract
    let erc20 = ERC20.bind(event.address);

    //fetch name
    let tokenName = erc20.try_name();
    if (!tokenName.reverted) {
      token.name = tokenName.value;
    }

    //fetch symbol
    let tokenSymbol = erc20.try_symbol();
    if (!tokenSymbol.reverted) {
      token.symbol = tokenSymbol.value;
    }

    //fetch decimals
    let tokenDecimal = erc20.try_decimals();
    if (!tokenDecimal.reverted) {
      token.decimals = tokenDecimal.value;
    }

    //save the details
    token.save();
  }
  return token;
}

export function handleTransfer(event: Transfer): void {
  let token = fetchTokenDetails(event)

  if (token != null) {
    let amount = toDecimal(event.params.value, token.decimals)

    let isBurn = event.params.to.toHex() == GENESIS_ADDRESS
    let isMint = event.params.from.toHex() == GENESIS_ADDRESS
    let isTransfer = !isBurn && !isMint

    if (isBurn) {
      handleBurnEvent(token, amount, event.params.from, event)
    } else if (isMint) {
      handleMintEvent(token, amount, event.params.to, event)
    } else if (isTransfer) {
      handleTransferEvent(token, amount, event.params.from, event.params.to, event)
    }

    // Updates balances of accounts
    if (isTransfer || isBurn) {
      let sourceAccount = getOrCreateAccount(event.params.from)

      let accountBalance = decreaseAccountBalance(sourceAccount, token as Token, amount)
      accountBalance.block = event.block.number
      accountBalance.modified = event.block.timestamp

      sourceAccount.save()
      accountBalance.save()

      // To provide information about evolution of account balances
      saveAccountBalanceSnapshot(accountBalance, event)
    }

    if (isTransfer || isMint) {
      let destinationAccount = getOrCreateAccount(event.params.to)

      let accountBalance = increaseAccountBalance(destinationAccount, token as Token, amount)
      accountBalance.block = event.block.number
      accountBalance.modified = event.block.timestamp

      destinationAccount.save()
      accountBalance.save()

      // To provide information about evolution of account balances
      saveAccountBalanceSnapshot(accountBalance, event)
    }
  }
}

function handleBurnEvent(token: Token | null, amount: BigDecimal, burner: Bytes, event: ethereum.Event): void {
  // Track total supply/burned
  if (token != null) {
    token.eventCount = token.eventCount.plus(ONE)
    token.burnEventCount = token.burnEventCount.plus(ONE)
    token.totalSupply = token.totalSupply.minus(amount)
    token.totalBurned = token.totalBurned.plus(amount)
    token.save()
  }
}

function handleMintEvent(token: Token | null, amount: BigDecimal, destination: Bytes, event: ethereum.Event): void {
  // Track total token supply/minted
  if (token != null) {
    token.eventCount = token.eventCount.plus(ONE)
    token.mintEventCount = token.mintEventCount.plus(ONE)
    token.totalSupply = token.totalSupply.plus(amount)
    token.totalMinted = token.totalMinted.plus(amount)
    token.save()
  }
}

function handleTransferEvent(
  token: Token | null,
  amount: BigDecimal,
  source: Bytes,
  destination: Bytes,
  event: ethereum.Event,
): void {
  // Track total token transferred
  if (token != null) {
    token.eventCount = token.eventCount.plus(ONE)
    token.transferEventCount = token.transferEventCount.plus(ONE)
    token.totalTransferred = token.totalTransferred.plus(amount)
    token.save()
  }
}
