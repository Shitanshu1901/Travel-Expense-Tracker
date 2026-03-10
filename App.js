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
  
  // Input States
  const [editingId, setEditingId] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [amount1, setAmount1] = useState('');
  const [currency1, setCurrency1] = useState('VND');
  const [category, setCategory] = useState('🍔 Food');
  const [customCategory, setCustomCategory] = useState('');
  const [txType, setTxType] = useState('Debit');
  const [isSplit, setIsSplit] = useState(false);
  const [splitNames, setSplitNames] = useState('');

  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState('add');
  const [newTripName, setNewTripName] = useState('');
  const [newTripBudget, setNewTripBudget] = useState('');

  // 1. DATA MIGRATION & LOADING
  const loadAllData = useCallback(async () => {
    const oldData = await AsyncStorage.getItem('@nexus_v5_master');
    const newData = await AsyncStorage.getItem('@nexus_v6_pro');
    let combinedTrips = {};
    let combinedBudgets = {};

    if (oldData) {
      const parsedOld = JSON.parse(oldData);
      combinedTrips = { ...parsedOld.trips };
    }
    if (newData) {
      const parsedNew = JSON.parse(newData);
      combinedTrips = { ...combinedTrips, ...parsedNew.trips };
      combinedBudgets = parsedNew.budgets || {};
      setMasterCurrency(parsedNew.masterCurrency || 'INR');
    }
    setTrips(combinedTrips);
    setTripBudgets(combinedBudgets);
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

  // 2. LOGIC FUNCTIONS
  const totals = useMemo(() => {
    let grand = 0;
    currentExpenses.forEach(e => {
      const amt = getConvertedAmount(e.amount_1, e.currency_1);
      grand += (e.type === 'Credit' ? -amt : amt);
    });
    return { grand };
  }, [currentExpenses, getConvertedAmount]);

  const handleSaveExpense = async () => {
    if (!amount1 || !description) return Alert.alert('Error', 'Fill all fields');
    if (isSplit && !splitNames) return Alert.alert('Error', 'Please enter friend names for split');
    
    const finalCategory = category === "🎟️ Other" ? `🎟️ ${customCategory || 'Other'}` : category;
    const expenseData = { 
      id: editingId || Date.now().toString(), date, description, category: finalCategory,
      amount_1: parseFloat(amount1), currency_1: currency1, 
      type: txType, split: isSplit, splitNames: splitNames, 
      method: "Cash 💵" // Defaulting for simple entry
    };

    let updatedList = editingId ? currentExpenses.map(item => item.id === editingId ? expenseData : item) : [expenseData, ...currentExpenses];
    updatedList.sort((a, b) => new Date(b.date) - new Date(a.date));

    const updatedTrips = { ...trips, [activeTrip]: updatedList };
    setTrips(updatedTrips); saveData(updatedTrips, activeTrip, masterCurrency, tripBudgets);
    
    setEditingId(null); setAmount1(''); setDescription(''); setCustomCategory(''); setIsSplit(false); setSplitNames(''); Keyboard.dismiss();
  };

  const deleteExpense = (id) => {
    Alert.alert("Delete", "Are you sure?", [
      { text: "No" },
      { text: "Yes", onPress: () => {
        const updated = currentExpenses.filter(e => e.id !== id);
        const updatedTrips = { ...trips, [activeTrip]: updated };
        setTrips(updatedTrips); saveData(updatedTrips, activeTrip, masterCurrency, tripBudgets);
      }}
    ]);
  };

  const deleteFullTrip = () => {
    Alert.alert("Delete Trip", `Delete all data for ${activeTrip}?`, [
      { text: "No" },
      { text: "Yes", onPress: () => {
        const updatedTrips = { ...trips }; delete updatedTrips[activeTrip];
        const updatedBudgets = { ...tripBudgets }; delete updatedBudgets[activeTrip];
        const next = Object.keys(updatedTrips)[0] || 'My First Trip';
        setTrips(updatedTrips); setActiveTrip(next); saveData(updatedTrips, next, masterCurrency, updatedBudgets);
      }}
    ]);
  };

  // 3. UI RENDERERS
  const renderHome = () => (
    <ScrollView ref={scrollRef} stickyHeaderIndices={[0]}>
      <View style={styles.header}>
        <Text style={styles.appTitle}>EXPENSE TRACKER</Text>
        {currentBudget > 0 && (
          <View style={styles.budgetContainer}>
            <View style={styles.budgetHeader}><Text style={styles.budgetLabel}>Budget</Text><Text style={styles.budgetLabel}>{getSymbol(masterCurrency)}{formatValue(totals.grand)} / {formatValue(currentBudget)}</Text></View>
            <View style={styles.progressBarBg}><View style={[styles.progressBarFill, { width: `${Math.min(totals.grand/currentBudget, 1)*100}%`, backgroundColor: (totals.grand/currentBudget) > 0.9 ? '#ef4444' : '#10b981' }]} /></View>
          </View>
        )}
        <View style={styles.row}>
          <View style={styles.tripPicker}><Picker selectedValue={activeTrip} onValueChange={setActiveTrip}>{Object.keys(trips).map(t => <Picker.Item key={t} label={t} value={t} />)}</Picker></View>
          <TouchableOpacity style={styles.iconBtn} onPress={() => openTripModal('rename')}><Text>✏️</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.iconBtn, {backgroundColor: '#fee2e2'}]} onPress={deleteFullTrip}><Text>🗑️</Text></TouchableOpacity>
          <TouchableOpacity style={styles.plusBtn} onPress={() => openTripModal('add')}><Text style={styles.plusText}>+</Text></TouchableOpacity>
        </View>
      </View>

      <View style={styles.inputCard}>
        <View style={styles.row}>
          <TextInput style={[styles.input, {flex:1}]} value={date} onChangeText={setDate} />
          <TouchableOpacity style={[styles.typeToggle, {backgroundColor: txType === 'Debit' ? '#fee2e2' : '#dcfce7'}]} onPress={() => setTxType(txType === 'Debit' ? 'Credit' : 'Debit')}><Text style={{color: txType === 'Debit' ? '#ef4444' : '#22c55e', fontWeight: 'bold'}}>{txType.toUpperCase()}</Text></TouchableOpacity>
        </View>
        <TextInput style={[styles.input, {marginBottom: 10}]} placeholder="Description" value={description} onChangeText={setDescription} />
        <View style={styles.row}>
          <View style={styles.halfPicker}><Picker selectedValue={category} onValueChange={setCategory}>{CATEGORIES.map(c => <Picker.Item key={c} label={c} value={c} />)}</Picker></View>
          <TextInput style={[styles.input, {flex:1}]} placeholder="Amount" keyboardType="numeric" value={amount1} onChangeText={setAmount1} />
        </View>
        <View style={[styles.rowBetween, {marginTop: 10}]}>
          <Text style={{fontWeight:'bold'}}>Split with Friends?</Text>
          <TouchableOpacity onPress={() => setIsSplit(!isSplit)} style={[styles.splitToggle, isSplit && {backgroundColor: '#3b82f6'}]}><Text style={{color: isSplit ? '#fff' : '#000'}}>👥 {isSplit ? 'YES' : 'NO'}</Text></TouchableOpacity>
        </View>
        {isSplit && <TextInput style={[styles.input, {marginTop: 10, borderColor: '#3b82f6', borderWidth: 1}]} placeholder="Names (e.g. Rahul, Amit)" value={splitNames} onChangeText={setSplitNames} />}
        <TouchableOpacity style={styles.submitBtn} onPress={handleSaveExpense}><Text style={styles.btnText}>{editingId ? 'UPDATE' : '+ ADD EXPENSE'}</Text></TouchableOpacity>
      </View>

      {currentExpenses.map(item => (
        <TouchableOpacity key={item.id} style={styles.card} onPress={() => { setEditingId(item.id); setDate(item.date); setDescription(item.description); setAmount1(item.amount_1.toString()); scrollRef.current?.scrollTo({y:0, animated:true}); }}>
          <View style={{flex: 1}}><Text style={styles.cardDate}>{item.date}</Text><Text style={styles.cardDesc}>{item.description}</Text></View>
          <View style={{alignItems: 'flex-end'}}>
            <Text style={[styles.cardAmt, {color: item.type === 'Credit' ? '#22c55e' : '#ef4444'}]}>{getSymbol(masterCurrency)}{formatValue(getConvertedAmount(item.amount_1, item.currency_1))}</Text>
            <TouchableOpacity onPress={() => deleteExpense(item.id)}><Text style={{color: 'red', fontSize: 20}}>×</Text></TouchableOpacity>
          </View>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const renderCharts = () => {
    // CATEGORY TOTALS FOR CHART
    const catData = CATEGORIES.map(cat => {
      const total = currentExpenses.filter(e => e.category === cat || (cat === "🎟️ Other" && e.category.startsWith("🎟️"))).reduce((s, e) => s + getConvertedAmount(e.amount_1, e.currency_1), 0);
      return { cat, total };
    });

    // SETTLEMENT LOGIC
    const settlements = {};
    currentExpenses.filter(e => e.split && e.splitNames).forEach(e => {
      const friends = e.splitNames.split(',').map(n => n.trim());
      const share = getConvertedAmount(e.amount_1, e.currency_1) / (friends.length + 1);
      friends.forEach(f => { settlements[f] = (settlements[f] || 0) + share; });
    });

    return (
      <ScrollView style={{padding: 20}}>
        <Text style={styles.appTitle}>Visual Analytics 📊</Text>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Category Breakdown</Text>
          {catData.map(item => {
            const perc = totals.grand > 0 ? (item.total / totals.grand) * 100 : 0;
            return (
              <View key={item.cat} style={{marginBottom: 15}}>
                <View style={styles.rowBetween}><Text style={styles.legendText}>{item.cat}</Text><Text style={styles.legendText}>{perc.toFixed(0)}%</Text></View>
                <View style={styles.progressBarBg}><View style={[styles.progressBarFill, {width: `${perc}%`, backgroundColor: '#3b82f6'}]} /></View>
              </View>
            );
          })}
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Who Owes You? 👥</Text>
          {Object.entries(settlements).length > 0 ? Object.entries(settlements).map(([name, amt]) => (
            <View key={name} style={styles.rowBetween}>
              <Text style={styles.legendText}>{name}</Text>
              <Text style={[styles.legendText, {color: '#22c55e'}]}>owes {getSymbol(masterCurrency)}{formatValue(amt)}</Text>
            </View>
          )) : <Text style={styles.legendText}>No split expenses found.</Text>}
        </View>
      </ScrollView>
    );
  };

  // TRIP MODAL HELPER
  const openTripModal = (m) => { setModalMode(m); setNewTripName(m==='rename'?activeTrip:''); setNewTripBudget(m==='rename'?(tripBudgets[activeTrip]||'').toString():''); setModalVisible(true); };
  const handleTripSubmit = () => { 
    if (!newTripName) return; const t = { ...trips }; const b = { ...tripBudgets }; 
    if (modalMode === 'add') { t[newTripName] = []; b[newTripName] = parseFloat(newTripBudget)||0; setActiveTrip(newTripName); }
    else { t[newTripName] = t[activeTrip]; b[newTripName] = parseFloat(newTripBudget)||0; if (newTripName!==activeTrip) { delete t[activeTrip]; delete b[activeTrip]; } setActiveTrip(newTripName); }
    setTrips(t); setTripBudgets(b); saveData(t, newTripName, masterCurrency, b); setModalVisible(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Modal visible={modalVisible} transparent><View style={styles.modalOverlay}><View style={styles.modalContent}>
        <Text style={styles.modalTitle}>{modalMode==='add'?'New Trip':'Edit Trip'}</Text>
        <TextInput style={styles.modalInput} value={newTripName} onChangeText={setNewTripName} placeholder="Trip Name" />
        <TextInput style={styles.modalInput} value={newTripBudget} onChangeText={setNewTripBudget} placeholder="Budget" keyboardType="numeric" />
        <View style={styles.row}><TouchableOpacity style={[styles.modalBtn, {backgroundColor:'#ccc'}]} onPress={()=>setModalVisible(false)}><Text>Cancel</Text></TouchableOpacity><TouchableOpacity style={styles.modalBtn} onPress={handleTripSubmit}><Text style={{color:'#fff'}}>Save</Text></TouchableOpacity></View>
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
  appTitle: { fontSize: 20, fontWeight: '900', color: '#1e293b', textAlign: 'center' },
  budgetContainer: { marginTop: 15 },
  budgetHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  budgetLabel: { fontSize: 11, fontWeight: '700', color: '#64748b' },
  progressBarBg: { height: 10, backgroundColor: '#e2e8f0', borderRadius: 5, overflow: 'hidden' },
  progressBarFill: { height: '100%' },
  row: { flexDirection: 'row', marginBottom: 10, alignItems: 'center' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  tripPicker: { flex: 1, backgroundColor: '#f1f5f9', borderRadius: 12, height: 45, justifyContent: 'center' },
  iconBtn: { backgroundColor: '#f1f5f9', width: 45, height: 45, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
  plusBtn: { backgroundColor: '#10b981', width: 45, height: 45, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
  plusText: { color: 'white', fontSize: 24, fontWeight: 'bold' },
  inputCard: { backgroundColor: '#fff', margin: 15, padding: 15, borderRadius: 20, elevation: 3 },
  input: { backgroundColor: '#f1f5f9', borderRadius: 12, padding: 12, color: '#000' },
  halfPicker: { flex: 1, backgroundColor: '#f1f5f9', borderRadius: 12, height: 50, justifyContent: 'center', marginRight: 10 },
  typeToggle: { paddingHorizontal: 12, height: 45, borderRadius: 12, justifyContent: 'center', marginLeft: 10 },
  splitToggle: { padding: 8, borderRadius: 8, backgroundColor: '#e2e8f0' },
  submitBtn: { backgroundColor: '#10b981', padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 15 },
  btnText: { color: 'white', fontWeight: 'bold' },
  card: { flexDirection: 'row', backgroundColor: '#fff', marginHorizontal: 15, marginBottom: 10, padding: 15, borderRadius: 16, borderLeftWidth: 4, borderColor: '#3b82f6' },
  cardDate: { fontSize: 10, color: '#94a3b8', fontWeight: 'bold' },
  cardDesc: { color: '#1e293b', fontWeight: 'bold', fontSize: 15 },
  cardAmt: { fontWeight: 'bold', fontSize: 17 },
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', height: 60, borderTopWidth: 1, borderColor: '#e2e8f0' },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabIcon: { fontSize: 24, color: '#94a3b8' },
  activeTab: { color: '#3b82f6' },
  summaryCard: { backgroundColor: '#fff', padding: 20, borderRadius: 20, marginTop: 20, elevation: 2 },
  summaryTitle: { fontWeight: 'bold', marginBottom: 15, fontSize: 16 },
  legendText: { fontWeight: 'bold', color: '#1e293b' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: 'white', padding: 25, borderRadius: 24, width: '85%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 20 },
  modalInput: { backgroundColor: '#f1f5f9', padding: 15, borderRadius: 12, marginBottom: 15 },
  modalBtn: { flex: 1, padding: 15, borderRadius: 12, alignItems: 'center', marginHorizontal: 5, backgroundColor: '#10b981' }
});
