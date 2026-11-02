use tally_ledger::Ledger;

fn main() {
    let mut ledger = Ledger::default();
    for amount in std::env::args().skip(1) {
        ledger.record(amount.parse().expect("amounts are numbers"));
    }
    println!("{:.2}", ledger.total());
}
