pub struct Node {
    pub name: String,
}

impl Node {
    pub fn run(&self) {
        println!("Running node: {}", self.name);
    }
}
