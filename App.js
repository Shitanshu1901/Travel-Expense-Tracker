import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, SafeAreaView, Keyboard, ScrollView, Modal, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const API_KEY = '8781e84bef6d6f9563c506e1'; 

const CATEGORIES = ["🍔 Food", "🏨 Hotel", "🚕 Transport", "🛍️ Shopping", "🎟️ Other"];
const CURRENCIES = [
  { label: "🇮🇳 INR (₹)", value: "INR", symbol: "₹" },
  { label: "🇺🇸 USD ($)", value: "USD", symbol: "$" },
  { label: "🇻🇳 VND (₫)", value: "VND", symbol: "₫" },
  { label: "🇪🇺 EUR (€)", value: "EUR", symbol: "€" },
  { label: "🇬🇧 GBP (£)", value: "GBP", symbol: "£" }
];

export default function App() {
  const scrollRef = useRef(null);
  const [currentTab, setCurrentTab] = useState('Home');
  const [trips, setTrips] = useState({});
  const [tripBudgets, setTripBudgets] = useState({});
  const [activeTrip, setActiveTrip] = useState('My First Trip');
  const [masterCurrency, setMasterCurrency] = useState('INR');
  const [rates, setRates] = useState({});
  
  const [editingId, setEditingId] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [amount1, setAmount1] = useState('');
  const [currency1, setCurrency1] = useState('VND');
  const [category, setCategory] = useState('🍔 Food');
  const [txType, setTxType] = useState('Debit');
  const [modalVisible, setModalVisible] = useState(false);
  const [newTripBudget, setNewTripBudget] = useState('');

  // 1. DATA LOADING & MIGRATION
  const loadAllData = useCallback(async () => {
    const oldData = await AsyncStorage.getItem('@nexus_v5_master');
    const newData = await AsyncStorage.getItem('@nexus_v6_pro');
    let combinedTrips = {}, combinedBudgets = {}, mCurr = 'INR';

    if (oldData) { combinedTrips = JSON.parse(oldData).trips || {}; }
    if (newData) {
      const parsed = JSON.parse(newData);
      combinedTrips = { ...combinedTrips, ...parsed.trips };
      combinedBudgets = parsed.budgets || {};
      mCurr = parsed.masterCurrency || 'INR';
    }
    setTrips(combinedTrips); setTripBudgets(combinedBudgets); setMasterCurrency(mCurr);
    if (Object.keys(combinedTrips).length > 0) setActiveTrip(Object.keys(combinedTrips)[0]);
  }, []);

  const fetchRates = useCallback(async () => {
    try {
      const res = await fetch(`https://v6.exchangerate-api.com/v6/${API_KEY}/latest/${masterCurrency}`);
      const data = await res.json();
      if (data.conversion_rates) setRates(data.conversion_rates);
    } catch (e) { console.log("Rate fetch failed"); }
  }, [masterCurrency]);

  useEffect(() => { loadAllData(); }, [loadAllData]);
  useEffect(() => { fetchRates(); }, [fetchRates]);

  const saveData = async (t, a, m, b) => {
    await AsyncStorage.setItem('@nexus_v6_pro', JSON.stringify({ trips: t, activeTrip: a, masterCurrency: m, budgets: b }));
  };

  const currentExpenses = useMemo(() => trips[activeTrip] || [], [trips, activeTrip]);
  const currentBudget = tripBudgets[activeTrip] || 0;
  
  const getConvertedAmount = useCallback((amount, fromCurrency) => {
    if (fromCurrency === masterCurrency) return amount;
    const rate = rates[fromCurrency];
    return rate ? amount / rate : amount;
  }, [rates, masterCurrency]);

  const formatValue = (n) => parseFloat(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  const getSymbol = (code) => CURRENCIES.find(c => c.value === code)?.symbol || "";

  const totals = useMemo(() => {
    let grand = 0;
    currentExpenses.forEach(e => {
      const amt = getConvertedAmount(e.amount_1, e.currency_1);
      grand += (e.type === 'Credit' ? -amt : amt);
    });
    return { grand };
  }, [currentExpenses, getConvertedAmount]);

  const handleSaveExpense = () => {
    if (!amount1 || !description) return Alert.alert('Error', 'Fill all fields');
    const expenseData = { 
      id: editingId || Date.now().toString(), date, description, category,
      amount_1: parseFloat(amount1), currency_1: currency1, type: txType, 
      method: "Cash 💵" 
    };
    let updatedList = editingId ? currentExpenses.map(item => item.id === editingId ? expenseData : item) : [expenseData, ...currentExpenses];
    updatedList.sort((a, b) => new Date(b.date) - new Date(a.date));
    const updatedTrips = { ...trips, [activeTrip]: updatedList };
    setTrips(updatedTrips); saveData(updatedTrips, activeTrip, masterCurrency, tripBudgets);
    setEditingId(null); setAmount1(''); setDescription('');
  };

  const sharePDF = async () => {
    const symbol = getSymbol(masterCurrency);
    const html = `<html><body style="font-family:sans-serif;padding:20px;"><h1 style="text-align:center;">${activeTrip} Report</h1><h2 style="text-align:center;color:#10b981;">Total Spent: ${symbol}${formatValue(totals.grand)}</h2><table style="width:100%;border-collapse:collapse;margin-top:20px;"><thead><tr style="background:#f1f5f9;"><th>Date</th><th>Description</th><th>Original Amt</th><th>Total (${masterCurrency})</th></tr></thead><tbody>${currentExpenses.map(e => `<tr><td style="border:1px solid #ddd;padding:8px;">${e.date}</td><td style="border:1px solid #ddd;padding:8px;">${e.description}</td><td style="border:1px solid #ddd;padding:8px;">${formatValue(e.amount_1)} ${e.currency_1}</td><td style="border:1px solid #ddd;padding:8px;">${symbol}${formatValue(getConvertedAmount(e.amount_1, e.currency_1))}</td></tr>`).join('')}</tbody></table></body></html>`;
    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri);
  };

  const renderHome = () => (
    <ScrollView ref={scrollRef} stickyHeaderIndices={[0]}>
      <View style={styles.header}>
        <Text style={styles.appTitle}>EXPENSE TRACKER</Text>
        <View style={styles.homeCurrencyRow}>
            <Text style={styles.subText}>Home Currency: </Text>
            <View style={styles.currencyPickerWrapper}>
              <Picker selectedValue={masterCurrency} onValueChange={(m) => { setMasterCurrency(m); saveData(trips, activeTrip, m, tripBudgets); }}>
                {CURRENCIES.map(c => <Picker.Item key={c.value} label={c.label} value={c.value} />)}
              </Picker>
            </View>
        </View>
        {currentBudget > 0 && (
          <View style={styles.budgetContainer}>
            <View style={styles.budgetHeader}><Text style={styles.budgetLabel}>Budget Status</Text><Text style={styles.budgetLabel}>{getSymbol(masterCurrency)}{formatValue(totals.grand)} / {formatValue(currentBudget)}</Text></View>
            <View style={styles.progressBarBg}><View style={[styles.progressBarFill, { width: `${Math.min(totals.grand/currentBudget, 1)*100}%`, backgroundColor: (totals.grand/currentBudget) > 0.9 ? '#ef4444' : '#10b981' }]} /></View>
          </View>
        )}
        <View style={styles.row}>
          <View style={styles.tripPicker}><Picker selectedValue={activeTrip} onValueChange={setActiveTrip}>{Object.keys(trips).map(t => <Picker.Item key={t} label={t} value={t} />)}</Picker></View>
          <TouchableOpacity style={styles.plusBtn} onPress={() => setModalVisible(true)}><Text style={styles.plusText}>+</Text></TouchableOpacity>
        </View>
      </View>

      <View style={styles.inputCard}>
        <View style={styles.row}>
          <TextInput style={[styles.input, {flex:1}]} value={date} onChangeText={setDate} />
          <TouchableOpacity style={[styles.typeToggle, {backgroundColor: txType === 'Debit' ? '#fee2e2' : '#dcfce7'}]} onPress={() => setTxType(txType === 'Debit' ? 'Credit' : 'Debit')}><Text style={{color: txType === 'Debit' ? '#ef4444' : '#22c55e', fontWeight: 'bold'}}>{txType.toUpperCase()}</Text></TouchableOpacity>
        </View>
        <TextInput style={[styles.input, {marginVertical: 10}]} placeholder="Description" value={description} onChangeText={setDescription} />
        <View style={styles.row}>
          <View style={styles.halfPicker}><Picker selectedValue={currency1} onValueChange={setCurrency1}>{CURRENCIES.map(c => <Picker.Item key={c.value} label={c.label} value={c.value} />)}</Picker></View>
          <TextInput style={[styles.input, {flex: 1}]} placeholder="Amount" keyboardType="numeric" value={amount1} onChangeText={setAmount1} />
        </View>
        <TouchableOpacity style={styles.submitBtn} onPress={handleSaveExpense}><Text style={styles.btnText}>+ ADD EXPENSE</Text></TouchableOpacity>
      </View>

      {currentExpenses.map(item => {
        const converted = getConvertedAmount(item.amount_1, item.currency_1);
        const rateDisplay = rates[item.currency_1] ? (1 / rates[item.currency_1]).toFixed(4) : "1.0000";
        return (
          <View key={item.id} style={styles.card}>
            <View style={{flex: 1}}>
              <Text style={styles.cardDate}>{item.date}</Text>
              <Text style={styles.cardDesc}>{item.description}</Text>
              <Text style={styles.rateText}>Rate: 1 {item.currency_1} = {rateDisplay} {masterCurrency}</Text>
            </View>
            <View style={{alignItems: 'flex-end'}}>
              <Text style={[styles.cardAmt, {color: item.type === 'Credit' ? '#22c55e' : '#ef4444'}]}>{getSymbol(masterCurrency)}{formatValue(converted)}</Text>
              <Text style={{fontSize: 10, color: '#64748b'}}>{formatValue(item.amount_1)} {item.currency_1}</Text>
            </View>
          </View>
        );
      })}
      <TouchableOpacity style={styles.exportBtn} onPress={sharePDF}><Text style={styles.btnText}>📤 EXPORT PDF REPORT</Text></TouchableOpacity>
      <View style={{height: 100}} />
    </ScrollView>
  );

  const renderCharts = () => (
    <View style={{flex:1, padding: 20}}>
      <Text style={styles.appTitle}>Analytics 📊</Text>
      <View style={styles.summaryCard}>
        {CATEGORIES.map(cat => {
          const catTotal = currentExpenses.filter(e => e.category === cat).reduce((s, e) => s + getConvertedAmount(e.amount_1, e.currency_1), 0);
          const perc = totals.grand > 0 ? (catTotal / totals.grand) * 100 : 0;
          return (
            <View key={cat} style={{marginBottom: 15}}>
              <View style={styles.rowBetween}><Text>{cat}</Text><Text>{perc.toFixed(0)}%</Text></View>
              <View style={styles.progressBarBg}><View style={[styles.progressBarFill, {width: `${perc}%`, backgroundColor: '#3b82f6'}]} /></View>
            </View>
          );
        })}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Modal visible={modalVisible} transparent><View style={styles.modalOverlay}><View style={styles.modalContent}>
        <Text style={styles.modalTitle}>New Trip</Text>
        <TextInput style={styles.modalInput} value={newTripBudget} onChangeText={setNewTripBudget} placeholder="Optional Budget" keyboardType="numeric" />
        <TouchableOpacity style={styles.modalBtn} onPress={() => { setTripBudgets({...tripBudgets, [activeTrip]: parseFloat(newTripBudget)||0}); setModalVisible(false); }}><Text style={{color:'#fff'}}>Save Budget</Text></TouchableOpacity>
      </View></View></Modal>
      {currentTab === 'Home' ? renderHome() : renderCharts()}
      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tabItem} onPress={() => setCurrentTab('Home')}><Text style={[styles.tabIcon, currentTab === 'Home' && styles.activeTab]}>🏠</Text></TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => setCurrentTab('Charts')}><Text style={[styles.tabIcon, currentTab === 'Charts' && styles.activeTab]}>📊</Text></TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { padding: 20, paddingTop: 40, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e2e8f0' },
  appTitle: { fontSize: 20, fontWeight: '900', textAlign: 'center', marginBottom: 10 },
  homeCurrencyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  currencyPickerWrapper: { width: 140, backgroundColor: '#f1f5f9', borderRadius: 10, height: 40, justifyContent: 'center' },
  subText: { color: '#64748b', fontSize: 13, fontWeight: 'bold' },
  budgetContainer: { marginTop: 10 },
  budgetHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  budgetLabel: { fontSize: 11, fontWeight: 'bold' },
  progressBarBg: { height: 10, backgroundColor: '#e2e8f0', borderRadius: 5, overflow: 'hidden' },
  progressBarFill: { height: '100%' },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between' },
  tripPicker: { flex: 1, backgroundColor: '#f1f5f9', borderRadius: 10, height: 45, justifyContent: 'center' },
  plusBtn: { backgroundColor: '#10b981', width: 45, height: 45, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
  plusText: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  inputCard: { backgroundColor: '#fff', margin: 15, padding: 15, borderRadius: 15, elevation: 3 },
  input: { backgroundColor: '#f1f5f9', borderRadius: 10, padding: 12, color: '#000' },
  halfPicker: { flex: 1, backgroundColor: '#f1f5f9', borderRadius: 10, height: 50, justifyContent: 'center', marginRight: 10 },
  submitBtn: { backgroundColor: '#10b981', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 15 },
  exportBtn: { backgroundColor: '#3b82f6', padding: 15, borderRadius: 10, alignItems: 'center', margin: 15 },
  btnText: { color: '#fff', fontWeight: 'bold' },
  card: { backgroundColor: '#fff', marginHorizontal: 15, marginBottom: 10, padding: 15, borderRadius: 12, borderLeftWidth: 5, borderColor: '#3b82f6', flexDirection: 'row', justifyContent: 'space-between' },
  cardDate: { fontSize: 10, color: '#94a3b8' },
  cardDesc: { fontWeight: 'bold', fontSize: 15 },
  rateText: { fontSize: 10, color: '#10b981', marginTop: 4, fontWeight: 'bold' },
  cardAmt: { fontWeight: 'bold', fontSize: 16 },
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', height: 60, borderTopWidth: 1, borderColor: '#e2e8f0' },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabIcon: { fontSize: 24, color: '#94a3b8' },
  activeTab: { color: '#3b82f6' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: 'white', padding: 25, borderRadius: 20, width: '80%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 20 },
  modalInput: { backgroundColor: '#f1f5f9', padding: 15, borderRadius: 10, marginBottom: 15 },
  modalBtn: { backgroundColor: '#10b981', padding: 15, borderRadius: 10, alignItems: 'center' },
  summaryCard: { backgroundColor: '#fff', padding: 20, borderRadius: 15, elevation: 2 }
});
