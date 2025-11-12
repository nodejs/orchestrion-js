pub struct Match {}

impl Match {
    pub fn end(&self) -> u8 {
        0
    }
}

pub struct MatchIter {}

impl Iterator for MatchIter {
    type Item = Match;

    fn next(&mut self) -> Option<Self::Item> {
        None
    }
}

pub struct Regex {}

impl Regex {
    pub fn new(_string: &str) -> Result<Self, std::io::Error>{
        Ok(Regex{})
    }

    pub fn find_iter(&self, _string: &str) -> MatchIter {
        MatchIter {}
    }
}
