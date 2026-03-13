import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, SafeAreaView, Keyboard, ScrollView, Modal, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const API_KEY = '8781e84bef6d6f9563c506e1'; 

const CATEGORIES = ["🍔 Food", "🏨 Hotel", "🚕 Transport", "🛍️ Shopping", "🎟️ Other"];
const PAYMENTS = ["Cash 💵", "Credit Card 💳", "Debit Card 💳", "Forex Card 💳", "UPI 📲"];
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
  const [activeTrip, setActiveTrip] = useState('');
  const [masterCurrency, setMasterCurrency] = useState('');
  const [rates, setRates] = useState({});
  
  const [editingId, setEditingId] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateObj, setDateObj] = useState(new Date());
  const [description, setDescription] = useState('');
  const [amount1, setAmount1] = useState('');
  const [currency1, setCurrency1] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [category, setCategory] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [txType, setTxType] = useState('Debit');
  const [isSplit, setIsSplit] = useState(false);
  const [splitNames, setSplitNames] = useState('');

  const [modalVisible, setModalVisible] = useState(false);
  const [newTripName, setNewTripName] = useState('');
  const [newTripBudget, setNewTripBudget] = useState('');

  const loadAllData = useCallback(async () => {
    const v6 = await AsyncStorage.getItem('@nexus_v6_pro');
    if (v6) {
      const p = JSON.parse(v6);
      setTrips(p.trips || {});
      setTripBudgets(p.budgets || {});
      setMasterCurrency(p.masterCurrency || '');
      if (p.activeTrip) setActiveTrip(p.activeTrip);
    }
  }, []);

  const fetchRates = useCallback(async () => {
    if (!masterCurrency) return;
    try {
      const res = await fetch(`https://v6.exchangerate-api.com/v6/${API_KEY}/latest/${masterCurrency}`);
      const d = await res.json();
      if (d.conversion_rates) setRates(d.conversion_rates);
    } catch (e) { console.log("Rate fetch failed"); }
  }, [masterCurrency]);

  useEffect(() => { loadAllData(); }, [loadAllData]);
  useEffect(() => { fetchRates(); }, [fetchRates]);

  const saveData = async (t, a, m, b) => {
    await AsyncStorage.setItem('@nexus_v6_pro', JSON.stringify({ trips: t, activeTrip: a, masterCurrency: m, budgets: b }));
  };

  const currentExpenses = useMemo(() => (activeTrip ? trips[activeTrip] || [] : []), [trips, activeTrip]);
  
  const getConvertedAmount = useCallback((amount, fromCurrency) => {
    if (!masterCurrency || fromCurrency === masterCurrency) return amount;
    const rate = rates[fromCurrency];
    return rate ? amount / rate : amount;
  }, [rates, masterCurrency]);

  const formatValue = (n) => parseFloat(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  const getSymbol = (code) => CURRENCIES.find(c => c.value === code)?.symbol || "";

  const totals = useMemo(() => {
    let cash = 0, nonCash = 0;
    currentExpenses.forEach(e => {
      const amt = getConvertedAmount(e.amount_1, e.currency_1);
      const factor = e.type === 'Credit' ? -1 : 1;
      if (e.method === 'Cash 💵') cash += (amt * factor);
      else nonCash += (amt * factor);
    });
    return { cash, nonCash, grand: cash + nonCash };
  }, [currentExpenses, getConvertedAmount]);

  const handleSaveExpense = () => {
    if (!amount1 || !description || !category || !currency1 || !paymentMethod) {
      return Alert.alert('Selection Required', 'Please ensure Category, Payment Mode, and Currency are selected.');
    }
    const finalCat = category === "🎟️ Other" ? `🎟️ ${customCategory || 'Other'}` : category;
    const exp = { 
      id: editingId || Date.now().toString(), 
      date: dateObj.toISOString().split('T')[0], 
      description, category: finalCat,
      amount_1: parseFloat(amount1), currency_1: currency1, type: txType, 
      method: paymentMethod, split: isSplit, splitNames 
    };
    let updated = editingId ? currentExpenses.map(i => i.id === editingId ? exp : i) : [exp, ...currentExpenses];
    updated.sort((a, b) => new Date(b.date) - new Date(a.date));
    const t = { ...trips, [activeTrip]: updated };
    setTrips(t); saveData(t, activeTrip, masterCurrency, tripBudgets);
    
    // Reset to "Blank" state
    setEditingId(null); setAmount1(''); setDescription(''); setIsSplit(false); 
    setSplitNames(''); setCategory(''); setCurrency1(''); setPaymentMethod('');
  };

  const renderHome = () => (
    <ScrollView ref={scrollRef} stickyHeaderIndices={[0]}>
      <View style={styles.header}>
        <Text style={styles.appTitle}>EXPENSE TRACKER</Text>
        <View style={styles.homeCurrencyRow}>
            <Text style={styles.subText}>Home Currency: </Text>
            <View style={styles.currencyPickerWrapper}>
              <Picker style={{color:'#000'}} dropdownIconColor="#000" selectedValue={masterCurrency} onValueChange={(m) => { setMasterCurrency(m); saveData(trips, activeTrip, m, tripBudgets); }}>
                <Picker.Item label="Select Home Currency" value="" />
                {CURRENCIES.map(c => <Picker.Item key={c.value} label={c.label} value={c.value} />)}
              </Picker>
            </View>
        </View>
        <View style={styles.row}>
          <View style={styles.tripPicker}>
            <Picker style={{color:'#000'}} dropdownIconColor="#000" selectedValue={activeTrip} onValueChange={setActiveTrip}>
              <Picker.Item label="Select Trip" value="" />
              {Object.keys(trips).map(t => <Picker.Item key={t} label={t} value={t} />)}
            </Picker>
          </View>
          <TouchableOpacity style={styles.plusBtn} onPress={() => {setNewTripName(''); setModalVisible(true)}}><Text style={styles.plusText}>+</Text></TouchableOpacity>
        </View>
        <Text style={styles.grandTotalText}>Grand Total: {getSymbol(masterCurrency)}{formatValue(totals.grand)}</Text>
      </View>

      <View style={styles.inputCard}>
        <TouchableOpacity style={styles.dateSelector} onPress={() => setShowDatePicker(true)}>
          <Text style={{color: '#000'}}>📅 Date: {dateObj.toLocaleDateString('en-GB')}</Text>
        </TouchableOpacity>
        {showDatePicker && (
          <DateTimePicker value={dateObj} mode="date" display="default" onChange={(e, d) => { setShowDatePicker(false); if(d) setDateObj(d); }} />
        )}

        <TextInput style={[styles.input, {marginVertical: 10, color:'#000'}]} placeholder="Add Description Here" placeholderTextColor="#94a3b8" value={description} onChangeText={setDescription} />
        
        <View style={styles.row}>
          <View style={styles.halfPicker}>
            <Picker style={{color:'#000'}} dropdownIconColor="#000" selectedValue={category} onValueChange={setCategory}>
              <Picker.Item label="Select your Category" value="" />
              {CATEGORIES.map(c => <Picker.Item key={c} label={c} value={c} />)}
            </Picker>
          </View>
          <TextInput style={[styles.input, {flex: 1, color:'#000'}]} placeholder="Add Amount Here" placeholderTextColor="#94a3b8" keyboardType="numeric" value={amount1} onChangeText={setAmount1} />
        </View>

        {category === "🎟️ Other" && (
          <TextInput style={[styles.input, {marginTop: 10, borderColor:'#10b981', borderWidth:1, color:'#000'}]} placeholder="Describe other category..." placeholderTextColor="#94a3b8" value={customCategory} onChangeText={setCustomCategory} />
        )}

        <View style={[styles.row, {marginTop:10}]}>
          <View style={styles.halfPicker}>
            <Picker style={{color:'#000'}} dropdownIconColor="#000" selectedValue={currency1} onValueChange={setCurrency1}>
              <Picker.Item label="Select Your Currency" value="" />
              {CURRENCIES.map(c => <Picker.Item key={c.value} label={c.label} value={c.value} />)}
            </Picker>
          </View>
          <View style={styles.halfPicker}>
            <Picker style={{color:'#000'}} dropdownIconColor="#000" selectedValue={paymentMethod} onValueChange={setPaymentMethod}>
              <Picker.Item label="Select Mode of Payment" value="" />
              {PAYMENTS.map(p => <Picker.Item key={p} label={p} value={p} />)}
            </Picker>
          </View>
        </View>

        <TouchableOpacity style={styles.submitBtn} onPress={handleSaveExpense}><Text style={styles.btnText}>+ ADD ENTRY</Text></TouchableOpacity>
      </View>
      <View style={{height: 150}} />
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}><View style={styles.modalContent}>
          <Text style={styles.modalTitle}>New Trip</Text>
          <TextInput style={styles.modalInput} value={newTripName} onChangeText={setNewTripName} placeholder="Trip Name" placeholderTextColor="#94a3b8" />
          <TextInput style={styles.modalInput} value={newTripBudget} onChangeText={setNewTripBudget} placeholder="Budget (Optional)" placeholderTextColor="#94a3b8" keyboardType="numeric" />
          <View style={styles.row}>
            <TouchableOpacity style={[styles.modalBtn, {backgroundColor:'#ccc'}]} onPress={() => setModalVisible(false)}><Text>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={styles.modalBtn} onPress={() => { 
                if(!newTripName) return; 
                const t = {...trips, [newTripName]: []}; 
                const b = {...tripBudgets, [newTripName]: parseFloat(newTripBudget)||0}; 
                setTrips(t); setTripBudgets(b); setActiveTrip(newTripName); saveData(t, newTripName, masterCurrency, b); setModalVisible(false); 
            }}><Text style={{color:'#fff'}}>Save</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>
      {renderHome()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { padding: 20, paddingTop: 45, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e2e8f0' },
  appTitle: { fontSize: 20, fontWeight: '900', color: '#1e293b', textAlign: 'center' },
  homeCurrencyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 10 },
  currencyPickerWrapper: { width: 200, backgroundColor: '#f1f5f9', borderRadius: 10, height: 40, justifyContent: 'center' },
  subText: { color: '#64748b', fontSize: 13, fontWeight: 'bold' },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  tripPicker: { flex: 1, backgroundColor: '#f1f5f9', borderRadius: 10, height: 45, justifyContent: 'center' },
  plusBtn: { backgroundColor: '#10b981', width: 45, height: 45, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  plusText: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  inputCard: { backgroundColor: '#fff', margin: 15, padding: 15, borderRadius: 20, elevation: 5 },
  input: { backgroundColor: '#f1f5f9', borderRadius: 12, padding: 12, color: '#000' },
  dateSelector: { backgroundColor: '#f1f5f9', borderRadius: 12, padding: 15, borderWidth: 1, borderColor: '#e2e8f0' },
  halfPicker: { flex: 1, backgroundColor: '#f1f5f9', borderRadius: 12, height: 50, justifyContent: 'center', marginRight: 5 },
  submitBtn: { backgroundColor: '#10b981', padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 15 },
  btnText: { color: '#fff', fontWeight: 'bold' },
  grandTotalText: { textAlign: 'center', fontSize: 16, fontWeight: '900', color: '#10b981', marginTop: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#fff', padding: 25, borderRadius: 25, width: '85%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 20, textAlign: 'center', color: '#000' },
  modalInput: { backgroundColor: '#f1f5f9', padding: 15, borderRadius: 12, marginBottom: 15, color: '#000' },
  modalBtn: { flex: 1, padding: 15, borderRadius: 12, alignItems: 'center', marginHorizontal: 5, backgroundColor: '#10b981' }
});
